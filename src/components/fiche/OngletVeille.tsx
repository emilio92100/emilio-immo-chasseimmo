'use client';
import { useState, useEffect, useCallback } from 'react';
import { supabase, addJournal } from '@/lib/supabase';

/**
 * Onglet Veille de la fiche client.
 *
 * Affiche les biens trouvés par la veille automatique et attendant ton arbitrage.
 *  - Retenir  → le bien passe dans la table `biens` (onglet Biens, comme d'habitude)
 *  - Écarter  → il sort de la liste, avec un motif relu par la veille suivante
 */

interface Props {
  clientId: string;
  rechercheId: string;
  onChange?: () => void;
}

type Proposition = {
  id: string;
  url: string;
  portail: string | null;
  date_annonce: string | null;
  titre: string | null;
  type_bien: string | null;
  ville: string | null;
  code_postal: string | null;
  quartier: string | null;
  adresse: string | null;
  prix: number | null;
  surface: number | null;
  nb_pieces: number | null;
  nb_chambres: number | null;
  surface_sejour: number | null;
  etage: number | null;
  etage_total: number | null;
  annee_construction: number | null;
  nb_lots: number | null;
  charges_trimestrielles: number | null;
  taxe_fonciere: number | null;
  dpe: string | null;
  ges: string | null;
  terrasse: boolean;
  balcon: boolean;
  jardin: boolean;
  parking: boolean;
  ascenseur: boolean;
  cave: boolean;
  gardien: boolean;
  surface_exterieur: number | null;
  exposition: string | null;
  description: string | null;
  photos: string[] | null;
  points_forts: string[] | null;
  points_attention: string[] | null;
  score: number | null;
  statut: string;
  motif_ecart: string | null;
  created_at: string;
};

type Passage = {
  termine_le: string | null;
  nb_lues: number | null;
  nb_proposees: number | null;
  nb_ecartees: number | null;
  statut: string | null;
};

const NAVY = '#1a2332';
const OR = '#c9a84c';

export default function OngletVeille({ clientId, rechercheId, onChange }: Props) {
  const [props_, setProps] = useState<Proposition[]>([]);
  const [ecartees, setEcartees] = useState<Proposition[]>([]);
  const [passage, setPassage] = useState<Passage | null>(null);
  const [chargement, setChargement] = useState(true);
  const [voirEcartees, setVoirEcartees] = useState(false);
  const [ecartEnCours, setEcartEnCours] = useState<string | null>(null);
  const [motif, setMotif] = useState('');
  const [enTraitement, setEnTraitement] = useState<string | null>(null);

  const charger = useCallback(async () => {
    if (!rechercheId) return;
    setChargement(true);

    const [nouv, ecart, pass] = await Promise.all([
      supabase
        .from('veille_propositions')
        .select('*')
        .eq('recherche_id', rechercheId)
        .eq('statut', 'nouveau')
        .order('score', { ascending: false, nullsFirst: false })
        .order('created_at', { ascending: false }),
      supabase
        .from('veille_propositions')
        .select('*')
        .eq('recherche_id', rechercheId)
        .eq('statut', 'ecarte')
        .order('created_at', { ascending: false })
        .limit(50),
      supabase
        .from('veille_passages')
        .select('termine_le, nb_lues, nb_proposees, nb_ecartees, statut')
        .eq('recherche_id', rechercheId)
        .order('demarre_le', { ascending: false })
        .limit(1)
        .maybeSingle(),
    ]);

    setProps((nouv.data as Proposition[]) || []);
    setEcartees((ecart.data as Proposition[]) || []);
    setPassage((pass.data as Passage) || null);
    setChargement(false);
  }, [rechercheId]);

  useEffect(() => {
    charger();
  }, [charger]);

  /** Retenir : le bien entre dans la table `biens`. */
  async function retenir(p: Proposition) {
    if (enTraitement) return;
    setEnTraitement(p.id);

    // Doublon éventuel dans les biens déjà présents
    if (p.url) {
      const { data: deja } = await supabase
        .from('biens')
        .select('id')
        .eq('recherche_id', rechercheId)
        .eq('url', p.url)
        .maybeSingle();
      if (deja) {
        alert('Ce bien est déjà dans la liste des biens.');
        await supabase
          .from('veille_propositions')
          .update({ statut: 'retenu', bien_id: deja.id, decide_le: new Date().toISOString() })
          .eq('id', p.id);
        setEnTraitement(null);
        charger();
        onChange?.();
        return;
      }
    }

    const { data: bien, error } = await supabase
      .from('biens')
      .insert({
        client_id: clientId,
        recherche_id: rechercheId,
        url: p.url || null,
        titre: p.titre,
        ville: p.ville,
        code_postal: p.code_postal,
        quartier: p.quartier || null,
        type_bien: p.type_bien,
        surface: p.surface,
        nb_pieces: p.nb_pieces,
        nb_chambres: p.nb_chambres,
        etage: p.etage,
        etage_total: p.etage_total,
        annee_construction: p.annee_construction,
        exposition: p.exposition || null,
        dpe: p.dpe || null,
        ges: p.ges || null,
        parking: p.parking || false,
        balcon: p.balcon || false,
        terrasse: p.terrasse || false,
        jardin: p.jardin || false,
        cave: p.cave || false,
        ascenseur: p.ascenseur || false,
        gardien: p.gardien || false,
        description: p.description,
        prix_vendeur: p.prix,
        commission_type: 'pourcentage',
        commission_val: null,
        prix_acquereur: p.prix,
        charges_trimestrielles: p.charges_trimestrielles,
        taxe_fonciere: p.taxe_fonciere,
        nb_lots: p.nb_lots,
        photos: p.photos || [],
        source_portail: p.portail || 'Veille',
        badge_retour: 'propose',
      })
      .select()
      .single();

    if (error || !bien) {
      alert("Impossible d'ajouter ce bien : " + (error?.message || 'erreur inconnue'));
      setEnTraitement(null);
      return;
    }

    await supabase
      .from('veille_propositions')
      .update({ statut: 'retenu', bien_id: bien.id, decide_le: new Date().toISOString() })
      .eq('id', p.id);

    await addJournal(
      clientId,
      'bien_ajoute',
      `🔎 Bien retenu depuis la veille — ${p.titre || p.ville || ''}`,
      p.url || ''
    );

    setEnTraitement(null);
    charger();
    onChange?.();
  }

  /** Écarter : sort de la liste, le motif nourrit les veilles suivantes. */
  async function ecarter(p: Proposition) {
    if (enTraitement) return;
    setEnTraitement(p.id);
    await supabase
      .from('veille_propositions')
      .update({
        statut: 'ecarte',
        motif_ecart: motif.trim() || null,
        decide_le: new Date().toISOString(),
      })
      .eq('id', p.id);
    setEcartEnCours(null);
    setMotif('');
    setEnTraitement(null);
    charger();
    onChange?.();
  }

  /** Remettre une annonce écartée dans la liste à valider. */
  async function restaurer(p: Proposition) {
    await supabase
      .from('veille_propositions')
      .update({ statut: 'nouveau', motif_ecart: null, decide_le: null })
      .eq('id', p.id);
    charger();
    onChange?.();
  }

  const euros = (n: number | null) =>
    n == null ? '—' : n.toLocaleString('fr-FR') + ' €';

  const quandPassage = () => {
    if (!passage?.termine_le) return null;
    const d = new Date(passage.termine_le);
    const auj = new Date();
    const memeJour = d.toDateString() === auj.toDateString();
    const heure = d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
    return memeJour
      ? `aujourd'hui à ${heure}`
      : `${d.toLocaleDateString('fr-FR')} à ${heure}`;
  };

  // ─────────────────────────────────────────────────────────────

  if (chargement) {
    return (
      <div style={{ padding: 40, textAlign: 'center', color: '#94a3b8', fontSize: 14 }}>
        Chargement de la veille…
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {/* En-tête */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: 10,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 11, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 17, fontWeight: 800, color: NAVY }}>
            {props_.length === 0
              ? 'Aucun bien à valider'
              : `${props_.length} bien${props_.length > 1 ? 's' : ''} à valider`}
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
          <button
            onClick={() => setVoirEcartees((v) => !v)}
            style={{
              background: 'white',
              border: '1px solid #e3e8f0',
              borderRadius: 9,
              padding: '8px 14px',
              fontSize: 13,
              fontWeight: 600,
              color: '#64748b',
              cursor: 'pointer',
              fontFamily: 'inherit',
            }}
          >
            {voirEcartees ? 'Masquer' : `Voir les ${ecartees.length} annonces écartées`}
          </button>
        )}
      </div>

      {/* Liste vide */}
      {props_.length === 0 && !voirEcartees && (
        <div
          style={{
            background: 'white',
            border: '1px solid #e3e8f0',
            borderRadius: 14,
            padding: '40px 20px',
            textAlign: 'center',
          }}
        >
          <div style={{ fontSize: 30, marginBottom: 10 }}>🔎</div>
          <div style={{ fontWeight: 700, color: NAVY, marginBottom: 4 }}>
            Rien de nouveau pour l&apos;instant
          </div>
          <div style={{ color: '#94a3b8', fontSize: 13 }}>
            {passage?.termine_le
              ? `La dernière veille n'a rien trouvé qui corresponde.`
              : `La veille n'a pas encore tourné sur cette recherche.`}
          </div>
        </div>
      )}

      {/* Propositions à valider */}
      {props_.map((p) => (
        <div
          key={p.id}
          style={{
            background: 'white',
            border: '1px solid #e3e8f0',
            borderLeft: `4px solid ${ecartEnCours === p.id ? OR : '#10b981'}`,
            borderRadius: 14,
            padding: 14,
            display: 'flex',
            flexDirection: 'column',
            gap: 11,
            opacity: enTraitement === p.id ? 0.5 : 1,
          }}
        >
          <div style={{ display: 'flex', gap: 16, alignItems: 'stretch', flexWrap: 'wrap' }}>
            {/* Photo */}
            <div
              style={{
                width: 144,
                height: 108,
                borderRadius: 10,
                background: '#e8edf3',
                flexShrink: 0,
                position: 'relative',
                overflow: 'hidden',
              }}
            >
              {p.photos?.[0] && (
                <img
                  src={p.photos[0]}
                  alt=""
                  style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                  onError={(e) => {
                    (e.target as HTMLImageElement).style.display = 'none';
                  }}
                />
              )}
              {!!p.photos?.length && (
                <span
                  style={{
                    position: 'absolute',
                    bottom: 6,
                    right: 6,
                    background: 'rgba(26,35,50,0.82)',
                    color: 'white',
                    borderRadius: 6,
                    padding: '2px 7px',
                    fontSize: 10,
                    fontWeight: 700,
                  }}
                >
                  {p.photos.length} photos
                </span>
              )}
            </div>

            {/* Contenu */}
            <div style={{ flexGrow: 1, minWidth: 260, display: 'flex', flexDirection: 'column', gap: 6 }}>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, flexWrap: 'wrap' }}>
                <span style={{ fontSize: 17, fontWeight: 800, color: NAVY }}>
                  {p.titre || `${p.type_bien || 'Bien'} — ${p.ville || ''}`}
                </span>
                <span style={{ fontSize: 11, color: '#94a3b8', fontWeight: 600 }}>
                  {p.portail || 'Annonce'}
                  {p.date_annonce
                    ? ` · ${new Date(p.date_annonce).toLocaleDateString('fr-FR')}`
                    : ''}
                </span>
              </div>

              <div style={{ display: 'flex', alignItems: 'baseline', gap: 16, flexWrap: 'wrap' }}>
                <span style={{ fontSize: 22, fontWeight: 800, color: OR, letterSpacing: -0.4 }}>
                  {euros(p.prix)}
                </span>
                <span style={{ fontSize: 14, color: NAVY, fontWeight: 600 }}>
                  {[
                    p.surface ? `${p.surface} m²` : null,
                    p.nb_pieces ? `${p.nb_pieces} pièces` : null,
                    p.nb_chambres ? `${p.nb_chambres} chambres` : null,
                    p.surface_sejour ? `séjour ${p.surface_sejour} m²` : null,
                  ]
                    .filter(Boolean)
                    .join(' · ')}
                </span>
                {p.prix && p.surface ? (
                  <span style={{ fontSize: 13, color: '#64748b' }}>
                    {Math.round(p.prix / Number(p.surface)).toLocaleString('fr-FR')} €/m²
                  </span>
                ) : null}
              </div>

              {!!p.points_forts?.length && (
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'flex-start',
                    gap: 8,
                    background: '#f0fdf4',
                    border: '1px solid #bbf7d0',
                    borderRadius: 9,
                    padding: '7px 12px',
                  }}
                >
                  <span style={{ color: '#16a34a', fontWeight: 800, flexShrink: 0 }}>✓</span>
                  <span style={{ fontSize: 13, color: '#15803d', fontWeight: 600, lineHeight: 1.5 }}>
                    {p.points_forts.join(' · ')}
                  </span>
                </div>
              )}

              {!!p.points_attention?.length && (
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
                  <span style={{ color: '#d97706', fontWeight: 800, flexShrink: 0 }}>!</span>
                  <span style={{ fontSize: 13, color: '#92400e', fontWeight: 600, lineHeight: 1.5 }}>
                    {p.points_attention.join(' · ')}
                  </span>
                </div>
              )}
            </div>

            {/* Actions */}
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: 7,
                justifyContent: 'center',
                flexShrink: 0,
                width: 156,
              }}
            >
              <a
                href={p.url}
                target="_blank"
                rel="noopener noreferrer"
                style={{
                  background: NAVY,
                  color: 'white',
                  borderRadius: 9,
                  padding: '10px 14px',
                  fontSize: 13,
                  fontWeight: 700,
                  textDecoration: 'none',
                  textAlign: 'center',
                }}
              >
                Voir l&apos;annonce
              </a>
              <button
                onClick={() => retenir(p)}
                disabled={!!enTraitement}
                style={{
                  background: OR,
                  color: 'white',
                  border: 'none',
                  borderRadius: 9,
                  padding: '10px 14px',
                  fontSize: 13,
                  fontWeight: 700,
                  cursor: 'pointer',
                  fontFamily: 'inherit',
                }}
              >
                ✓ Retenir
              </button>
              <button
                onClick={() => {
                  setEcartEnCours(ecartEnCours === p.id ? null : p.id);
                  setMotif('');
                }}
                disabled={!!enTraitement}
                style={{
                  background: ecartEnCours === p.id ? '#f1f5f9' : 'white',
                  color: ecartEnCours === p.id ? NAVY : '#64748b',
                  border: `1px solid ${ecartEnCours === p.id ? '#cbd5e1' : '#e3e8f0'}`,
                  borderRadius: 9,
                  padding: '10px 14px',
                  fontSize: 13,
                  fontWeight: ecartEnCours === p.id ? 700 : 600,
                  cursor: 'pointer',
                  fontFamily: 'inherit',
                }}
              >
                ✕ Écarter
              </button>
            </div>
          </div>

          {/* Motif d'écartement */}
          {ecartEnCours === p.id && (
            <div
              style={{
                background: '#fffbeb',
                border: '1px solid #fde68a',
                borderLeft: `4px solid ${OR}`,
                borderRadius: 10,
                padding: '10px 14px',
                display: 'flex',
                alignItems: 'center',
                gap: 12,
                flexWrap: 'wrap',
              }}
            >
              <label
                htmlFor={`motif-${p.id}`}
                style={{
                  fontSize: 11,
                  fontWeight: 800,
                  color: '#92400e',
                  textTransform: 'uppercase',
                  letterSpacing: 0.8,
                  flexShrink: 0,
                }}
              >
                Pourquoi l&apos;écarter ?
              </label>
              <input
                id={`motif-${p.id}`}
                type="text"
                value={motif}
                onChange={(e) => setMotif(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && ecarter(p)}
                autoFocus
                placeholder="Ex : trop de travaux, mauvaise rue, immeuble en brique…"
                style={{
                  flexGrow: 1,
                  minWidth: 220,
                  border: '1px solid #fde68a',
                  borderRadius: 8,
                  padding: '9px 12px',
                  fontSize: 13,
                  color: NAVY,
                  fontFamily: 'inherit',
                  background: 'white',
                }}
              />
              <span style={{ fontSize: 12, color: '#92400e', fontWeight: 600 }}>
                Relu par les prochaines veilles
              </span>
              <button
                onClick={() => ecarter(p)}
                style={{
                  background: NAVY,
                  color: 'white',
                  border: 'none',
                  borderRadius: 8,
                  padding: '9px 16px',
                  fontSize: 13,
                  fontWeight: 700,
                  cursor: 'pointer',
                  fontFamily: 'inherit',
                }}
              >
                Confirmer
              </button>
            </div>
          )}
        </div>
      ))}

      {/* Annonces écartées */}
      {voirEcartees && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 6 }}>
          <div
            style={{
              fontSize: 11,
              fontWeight: 800,
              color: '#94a3b8',
              textTransform: 'uppercase',
              letterSpacing: 0.9,
            }}
          >
            Annonces écartées
          </div>
          {ecartees.map((p) => (
            <div
              key={p.id}
              style={{
                background: '#f8fafc',
                border: '1px solid #e3e8f0',
                borderRadius: 11,
                padding: '10px 14px',
                display: 'flex',
                alignItems: 'center',
                gap: 14,
                flexWrap: 'wrap',
              }}
            >
              <span style={{ fontSize: 14, fontWeight: 700, color: '#64748b', flexGrow: 1 }}>
                {p.titre || p.ville}
              </span>
              <span style={{ fontSize: 13, color: '#94a3b8' }}>{euros(p.prix)}</span>
              {p.motif_ecart && (
                <span
                  style={{
                    fontSize: 12,
                    color: '#92400e',
                    background: '#fffbeb',
                    border: '1px solid #fde68a',
                    borderRadius: 7,
                    padding: '3px 10px',
                    fontWeight: 600,
                  }}
                >
                  {p.motif_ecart}
                </span>
              )}
              <a
                href={p.url}
                target="_blank"
                rel="noopener noreferrer"
                style={{ fontSize: 12, color: '#64748b', fontWeight: 600 }}
              >
                Voir
              </a>
              <button
                onClick={() => restaurer(p)}
                style={{
                  background: 'none',
                  border: 'none',
                  color: OR,
                  fontSize: 12,
                  fontWeight: 700,
                  cursor: 'pointer',
                  fontFamily: 'inherit',
                }}
              >
                Remettre
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
