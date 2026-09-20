'use client';
import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import {
  Frise, ModaleObservation, ModaleEnvoi, Chip, BoutonLien, CARTE,
  Vignettes, Specs, BandeauMarche, StylesEmilio, Icone, Action, NAVY, OR, BORD,
} from './ParcoursBien';

/**
 * Deux onglets pour un seul composant :
 *
 *   mode="selection" → ce que tu as retenu, pas encore envoyé
 *   mode="presentes" → ce que le client a reçu
 */

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
    return <div style={{ padding: 40, textAlign: 'center', color: '#b6c1d1', fontSize: 14, minHeight: 200 }}>Chargement…</div>;
  }

  if (biens.length === 0) {
    return (
      <><StylesEmilio /><div className="emi-arrivee" style={{ ...CARTE, padding: '44px 20px', textAlign: 'center' }}>
        <div style={{ fontSize: 28, marginBottom: 10 }}>{mode === 'selection' ? '📋' : '📤'}</div>
        <div style={{ fontWeight: 700, color: NAVY, fontSize: 15, marginBottom: 4 }}>
          {mode === 'selection' ? 'Aucun bien en sélection' : 'Rien n’a encore été envoyé'}
        </div>
        <div style={{ color: '#94a3b8', fontSize: 13 }}>
          {mode === 'selection'
            ? 'Retiens un bien depuis l’onglet Veille et il apparaîtra ici.'
            : 'Les biens que tu envoies depuis la Sélection arrivent dans cet onglet.'}
        </div>
      </div></>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <StylesEmilio />

      <div className="emi-arrivee" style={{ display: 'flex', alignItems: 'baseline', gap: 11, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 19, fontWeight: 800, color: NAVY, letterSpacing: -.3 }}>
          {biens.length} bien{biens.length > 1 ? 's' : ''} {mode === 'selection' ? 'en sélection' : 'présenté' + (biens.length > 1 ? 's' : '')}
        </span>
        <span style={{ fontSize: 13, color: '#94a3b8' }}>
          {mode === 'selection' ? 'Prépare le PDF, fixe tes honoraires, puis envoie.' : 'Note le retour du client sur chacun.'}
        </span>
      </div>

      {biens.map((b, idx) => {
        const r = RETOURS[b.badge_retour] || RETOURS.propose;
        const ouvert = frise === b.id;
        const honoraires = b.prix_acquereur && b.prix_vendeur ? b.prix_acquereur - b.prix_vendeur : 0;
        const prixAff = b.prix_acquereur || b.prix_vendeur;
        // BandeauMarche lit `prix` : on lui donne le prix vendeur, celui du marché
        const marche = { ...b, prix: b.prix_vendeur, agence: b.agence_nom, portail: b.source_portail };
        const atouts: React.ReactNode[] = [];
        if (b.terrasse && !b.surface_exterieur) atouts.push(<Chip key="t" ton="or">Terrasse</Chip>);
        if (b.balcon && !b.surface_exterieur) atouts.push(<Chip key="b">Balcon</Chip>);
        if (b.jardin && !b.surface_exterieur) atouts.push(<Chip key="j">Jardin</Chip>);
        if (b.parking) atouts.push(<Chip key="p">{b.nb_parking > 1 ? `${b.nb_parking} parkings` : 'Parking'}</Chip>);
        if (b.ascenseur) atouts.push(<Chip key="a">Ascenseur</Chip>);
        if (b.cave) atouts.push(<Chip key="c">Cave</Chip>);
        if (b.est_particulier) atouts.push(<Chip key="x" ton="vert">Particulier</Chip>);

        return (
          <div key={b.id} className="emi-carte emi-arrivee"
            style={{ ...CARTE, animationDelay: Math.min(idx, 6) * 55 + 'ms' }}>

            <Vignettes photos={b.photos || []}
              coinGauche={mode === 'presentes'
                ? <span style={{ background: r.bg, color: r.c, border: `1px solid ${r.bd}`, borderRadius: 20, padding: '4px 12px', fontSize: 11.5, fontWeight: 800, boxShadow: '0 4px 12px -6px rgba(16,24,40,.5)' }}>{r.i} {r.l}</span>
                : undefined} />

            {/* ── titre, adresse, prix ─────────────────────── */}
            <div style={{ padding: '15px 18px 0', display: 'flex', gap: 18, justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap' }}>
              <div style={{ minWidth: 220, flex: '1 1 320px' }}>
                <div style={{ fontSize: 18, fontWeight: 800, color: NAVY, lineHeight: 1.3, letterSpacing: -.2 }}>
                  {b.titre || `${b.type_bien || 'Bien'} — ${b.ville || ''}`}
                </div>
                {(b.adresse || b.adresse_probable || b.quartier || b.ville) && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 6, fontSize: 13.5, color: '#64748b', flexWrap: 'wrap' }}>
                    <span style={{ color: '#a9b6c8', display: 'flex' }}><Icone nom="lieu" taille={15} /></span>
                    <span style={{ fontWeight: 600 }}>
                      {b.adresse || b.adresse_probable || b.quartier || b.ville}
                      {b.situation ? ` — ${b.situation}` : ''}
                    </span>
                  </div>
                )}
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4, flexShrink: 0 }}>
                <div style={{ fontSize: 25, fontWeight: 800, color: OR, letterSpacing: -.8, lineHeight: 1.1 }}>{euros(prixAff)}</div>
                {honoraires > 0
                  ? <div style={{ fontSize: 12, color: '#94a3b8', fontWeight: 600 }}>dont {honoraires.toLocaleString('fr-FR')} € d&apos;honoraires</div>
                  : prixAff && b.surface
                    ? <div style={{ fontSize: 12, color: '#94a3b8', fontWeight: 600 }}>{Math.round(prixAff / Number(b.surface)).toLocaleString('fr-FR')} €/m²</div>
                    : null}
                {mode === 'presentes' && b.envoye_le && (
                  <div style={{ fontSize: 11.5, color: '#a9b6c8' }}>
                    envoyé le {new Date(b.envoye_le).toLocaleDateString('fr-FR')}
                    {b.canal_envoi ? ` · ${b.canal_envoi === 'mail' ? 'mail' : b.canal_envoi === 'whatsapp' ? 'WhatsApp' : 'lien'}` : ''}
                  </div>
                )}
                {mode === 'presentes' && (
                  <div style={{ fontSize: 11.5, fontWeight: 700, color: b.nb_vues ? '#2563eb' : '#cbd5e1' }}>
                    {b.nb_vues ? `👁️ ouvert ${b.nb_vues} fois par le client` : '👁️ jamais ouvert'}
                  </div>
                )}
              </div>
            </div>

            {/* ── caractéristiques, marché, retour ─────────── */}
            <div style={{ padding: '13px 18px 16px', display: 'flex', flexDirection: 'column', gap: 11 }}>
              <Specs p={b} />
              <BandeauMarche p={marche} />

              {b.retour_client && (
                <div style={{ background: r.bg, border: `1px solid ${r.bd}`, borderLeft: `3px solid ${r.c}`, borderRadius: 11, padding: '9px 13px', fontSize: 13.5, color: r.c, fontStyle: 'italic' }}>
                  « {b.retour_client} »
                  {b.retour_le && <span style={{ fontStyle: 'normal', opacity: .6, fontSize: 11.5 }}> — {new Date(b.retour_le).toLocaleDateString('fr-FR')}</span>}
                </div>
              )}

              {atouts.length > 0 && (
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>{atouts}</div>
              )}

              {b.pdf_message && (
                <div style={{ fontSize: 12.5, color: '#92400e', background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 10, padding: '8px 12px', lineHeight: 1.5 }}>
                  {b.pdf_message}
                </div>
              )}
            </div>

            {/* ── pied de carte : les actions ──────────────── */}
            <div style={{
              borderTop: `1px solid ${BORD}`, background: '#fbfcfe', padding: '11px 18px',
              display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap',
            }}>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
                {b.url && <BoutonLien href={b.url}>↗&nbsp; Annonce d&apos;origine</BoutonLien>}
                <BoutonLien onClick={() => onFiche(b.id)}>✎&nbsp; Détail</BoutonLien>
                <BoutonLien onClick={() => setFrise(ouvert ? null : b.id)} actif={ouvert}>
                  ◷&nbsp; {ouvert ? 'Masquer le parcours' : 'Parcours du bien'}
                </BoutonLien>
              </div>

              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                {mode === 'selection' ? (
                  <>
                    {b.pdf_statut === 'pret' && b.pdf_url ? (
                      <Action href={b.pdf_url} ton="neutre">📄&nbsp; PDF prêt — consulter</Action>
                    ) : b.pdf_statut === 'demande' ? (
                      <Action ton="neutre" disabled>⏳&nbsp; PDF en fabrication</Action>
                    ) : (
                      <Action onClick={() => demanderPdf(b.id)} ton="neutre">📄&nbsp; Préparer le PDF</Action>
                    )}
                    <Action onClick={() => setEnvoi(b)} ton="or">📤&nbsp; Envoyer</Action>
                  </>
                ) : (
                  <>
                    {b.pdf_url && <Action href={b.pdf_url} ton="neutre">📄&nbsp; Le PDF</Action>}
                    <Action onClick={() => onVisite(b.id)} ton="violet">📅&nbsp; Planifier une visite</Action>
                    <Action onClick={() => setObs(b)} ton="navy">💬&nbsp; Observation</Action>
                    <button type="button" onClick={() => renvoyerEnSelection(b.id)}
                      style={{ background: 'none', border: 'none', color: '#a9b6c8', fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>
                      Remettre en sélection
                    </button>
                  </>
                )}
              </div>
            </div>

            <div className="emi-volet" data-ouvert={ouvert}>
              <div>
                <div style={{ borderTop: `1px solid ${BORD}`, background: '#fbfcfe', padding: '16px 18px 12px' }}>
                  <div style={{ fontSize: 10.5, fontWeight: 800, color: '#9aa8bd', textTransform: 'uppercase', letterSpacing: .9, marginBottom: 9 }}>
                    Parcours du bien
                  </div>
                  {ouvert && <Frise bienId={b.id} rafraichir={tick} />}
                </div>
              </div>
            </div>
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
