'use client';
import { useState, useEffect, useCallback, Fragment } from 'react';
import { supabase } from '@/lib/supabase';
import {
  Frise, ModaleObservation, ModaleEnvoi, Chip, BoutonLien, CARTE,
  Vignettes, Specs, BandeauMarche, StylesEmilio, Icone, Action, NAVY, OR, BORD,
  useAffichage, BasculeAffichage, LigneCompacte, BoutonIcone, resumeSpecs,
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

/* Un bien présenté reste présenté : c'est son historique. Mais dans l'onglet,
   il se range selon ce que le client en a dit, et ce qui appelle une action
   de ta part passe devant. « En attente » n'est pas une réponse : c'est un
   silence, et c'est ce qui relance. */
const GROUPES_P: { id: string; titre: string; note?: string }[] = [
  { id: 'souhaite_visiter', titre: 'Il veut visiter', note: 'À caler en priorité : contacte l’agence ou le vendeur.' },
  { id: 'interesse', titre: 'Ça lui plaît', note: 'Tiède ou chaud : un appel tranche souvent plus vite qu’un message.' },
  { id: 'propose', titre: 'En attente de son retour', note: 'Il ne s’est pas encore prononcé. Relance au bout de deux ou trois jours.' },
  { id: 'offre_faite', titre: 'Offre faite' },
  { id: 'visite', titre: 'Visite effectuée' },
  { id: 'refuse', titre: 'Pas pour lui', note: 'Lis la raison : c’est elle qui affine la recherche suivante.' },
];
const groupeP = (b: { badge_retour?: string | null }) =>
  (b.badge_retour && GROUPES_P.some(g => g.id === b.badge_retour) ? b.badge_retour : 'propose');

/* « Il y a deux heures » se lit plus vite qu'une date. */
function depuisQuand(d?: string | null) {
  if (!d) return '';
  const x = new Date(d); if (isNaN(x.getTime())) return '';
  const min = Math.round((Date.now() - x.getTime()) / 60000);
  if (min < 2) return "à l'instant";
  if (min < 60) return `il y a ${min} min`;
  const h = Math.round(min / 60);
  if (h < 24) return `il y a ${h} h`;
  const j = Math.round(h / 24);
  if (j === 1) return 'hier';
  if (j < 8) return `il y a ${j} jours`;
  return 'le ' + x.toLocaleDateString('fr-FR');
}

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
  const [filtreP, setFiltreP] = useState('tout');   // onglet « Présentés » : quel retour afficher
  const [compact, setCompact] = useAffichage('biens-' + mode);  // détaillé ou une ligne par bien

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

  /* Le rangement de l'onglet « Présentés ». En mode sélection, rien ne change. */
  const parGroupe: Record<string, any[]> = {};
  biens.forEach(b => { const g = groupeP(b); (parGroupe[g] ||= []).push(b); });
  const groupesVisibles = mode === 'presentes' ? GROUPES_P.filter(g => (parGroupe[g.id] || []).length > 0) : [];
  const repondus = biens.filter(b => b.badge_retour && b.badge_retour !== 'propose').length;
  const ordonnes = mode === 'presentes' ? groupesVisibles.flatMap(g => parGroupe[g.id]) : biens;
  const affiches = mode === 'presentes' && filtreP !== 'tout' ? (parGroupe[filtreP] || []) : ordonnes;
  /* Un titre de groupe s'insère au-dessus du premier bien de chaque groupe. */
  const enTeteDe = (b: any, idx: number) => {
    if (mode !== 'presentes' || filtreP !== 'tout') return null;
    const g = groupeP(b);
    if (idx > 0 && groupeP(affiches[idx - 1]) === g) return null;
    const def = GROUPES_P.find(x => x.id === g)!;
    const r = RETOURS[g];
    return (
      <div key={'t-' + g} style={{ display: 'flex', alignItems: 'center', gap: 10, margin: idx === 0 ? '2px 0 -2px' : '16px 0 -2px', flexWrap: 'wrap' }}>
        <span style={{ fontSize: 16 }}>{r.i}</span>
        <span style={{ fontSize: 15, fontWeight: 800, color: NAVY }}>{def.titre}</span>
        <span style={{ fontSize: 11, fontWeight: 800, color: r.c, background: r.bg, border: `1px solid ${r.bd}`, borderRadius: 20, padding: '1px 8px' }}>{parGroupe[g].length}</span>
        {def.note && <span style={{ fontSize: 12.5, color: '#94a3b8', flex: '1 1 260px' }}>{def.note}</span>}
      </div>
    );
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: compact ? 7 : 14 }}>
      <StylesEmilio />

      <div className="emi-arrivee" style={{ display: 'flex', alignItems: 'baseline', gap: 11, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 19, fontWeight: 800, color: NAVY, letterSpacing: -.3 }}>
          {biens.length} bien{biens.length > 1 ? 's' : ''} {mode === 'selection' ? 'en sélection' : 'présenté' + (biens.length > 1 ? 's' : '')}
        </span>
        <span style={{ fontSize: 13, color: '#94a3b8' }}>
          {mode === 'selection' ? 'Fixe tes honoraires et envoie. La fiche soignée est facultative.' : 'Rangés selon ce que le client en a dit.'}
        </span>
        <span style={{ marginLeft: 'auto', display: 'inline-flex', alignItems: 'center', gap: 10 }}>
          {mode === 'presentes' && repondus > 0 && (
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7, background: '#eff6ff', border: '1px solid #bfdbfe', color: '#1d4ed8', borderRadius: 20, padding: '5px 13px', fontSize: 12.5, fontWeight: 800 }}>
              💬 {repondus} retour{repondus > 1 ? 's' : ''} reçu{repondus > 1 ? 's' : ''}
            </span>
          )}
          <BasculeAffichage compact={compact} onChange={setCompact} />
        </span>
      </div>

      {mode === 'presentes' && groupesVisibles.length > 1 && (
        <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap', alignItems: 'center' }}>
          {[{ id: 'tout', titre: 'Tout', n: biens.length }, ...groupesVisibles.map(g => ({ id: g.id, titre: g.titre, n: parGroupe[g.id].length }))].map(f => {
            const actif = filtreP === f.id;
            const r = RETOURS[f.id];
            return (
              <button type="button" key={f.id} onClick={() => setFiltreP(f.id)}
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: 7, borderRadius: 20, padding: '7px 13px',
                  fontFamily: 'inherit', fontSize: 12.5, fontWeight: 700, cursor: 'pointer',
                  border: `1px solid ${actif ? NAVY : BORD}`, background: actif ? NAVY : 'white',
                  color: actif ? 'white' : '#64748b', transition: 'all .12s',
                }}>
                {r ? <span>{r.i}</span> : null}{f.titre}
                <span style={{ fontSize: 11, fontWeight: 800, borderRadius: 20, padding: '1px 7px', background: actif ? 'rgba(255,255,255,.18)' : '#f1f5f9', color: actif ? 'white' : '#94a3b8' }}>{f.n}</span>
              </button>
            );
          })}
        </div>
      )}

      {affiches.map((b, idx) => {
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

        const aRepondu = mode === 'presentes' && b.badge_retour && b.badge_retour !== 'propose';

        /* ── affichage compact : une ligne, et tout le reste au clic ── */
        if (compact) {
          return (
            <Fragment key={b.id}>
              {enTeteDe(b, idx)}
              <LigneCompacte
                photo={(b.photos || [])[0]}
                numero={idx + 1}
                titre={b.titre || `${b.type_bien || 'Bien'} — ${b.ville || ''}`}
                lieu={b.adresse || b.adresse_probable || b.quartier || b.ville}
                specs={resumeSpecs(b)}
                prix={euros(prixAff)}
                sousPrix={honoraires > 0
                  ? `dont ${honoraires.toLocaleString('fr-FR')} € d'honoraires`
                  : prixAff && b.surface ? `${Math.round(prixAff / Number(b.surface)).toLocaleString('fr-FR')} €/m²` : null}
                accent={mode === 'presentes' ? r.c : undefined}
                badge={mode === 'presentes' ? (
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, background: r.bg, color: r.c, border: `1px solid ${r.bd}`, borderRadius: 20, padding: '1px 8px', fontSize: 11, fontWeight: 800 }}>
                    {r.i} {r.l}
                  </span>
                ) : b.pdf_statut === 'pret' ? (
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, background: '#f0fdf4', color: '#15803d', border: '1px solid #bbf7d0', borderRadius: 20, padding: '1px 8px', fontSize: 11, fontWeight: 800 }}>
                    📄 fiche prête
                  </span>
                ) : undefined}
                onOuvrir={() => onFiche(b.id)}
                actions={
                  <>
                    {b.url && <BoutonIcone icone="lien" titre="Ouvrir l'annonce d'origine" href={b.url} />}
                    <BoutonIcone icone="crayon" titre="Ouvrir le détail du bien" onClick={() => onFiche(b.id)} />
                    {mode === 'selection'
                      ? <BoutonIcone icone="envoyer" titre="Envoyer au client" ton="or" onClick={() => setEnvoi(b)} />
                      : <BoutonIcone icone="calendrier" titre="Planifier une visite" onClick={() => onVisite(b.id)} />}
                  </>
                }
              />
            </Fragment>
          );
        }

        return (
          <Fragment key={b.id}>
          {enTeteDe(b, idx)}
          <div className="emi-carte emi-arrivee"
            style={{ ...CARTE, animationDelay: Math.min(idx, 6) * 55 + 'ms' }}>

            <Vignettes photos={b.photos || []}
              coinGauche={mode === 'presentes'
                ? <span style={{ background: r.bg, color: r.c, border: `1px solid ${r.bd}`, borderRadius: 20, padding: '4px 12px', fontSize: 11.5, fontWeight: 800, boxShadow: '0 4px 12px -6px rgba(16,24,40,.5)' }}>{r.i} {r.l}</span>
                : undefined} />

            {/* Le retour du client se lit AVANT la fiche, pas en bas en petit :
                c'est l'information qui décide de ce que tu fais ensuite. */}
            {aRepondu && (
              <div style={{ background: r.bg, borderBottom: `1px solid ${r.bd}`, borderLeft: `4px solid ${r.c}`, padding: '13px 18px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 9, flexWrap: 'wrap' }}>
                  <span style={{ fontSize: 17, lineHeight: 1 }}>{r.i}</span>
                  <span style={{ fontSize: 15, fontWeight: 800, color: r.c, letterSpacing: -.2 }}>{r.l}</span>
                  {b.retour_le && <span style={{ fontSize: 12.5, color: '#94a3b8', fontWeight: 600 }}>· {depuisQuand(b.retour_le)}</span>}
                  <span style={{ marginLeft: 'auto', fontSize: 10, fontWeight: 800, letterSpacing: 1, textTransform: 'uppercase', color: '#a9b6c8' }}>
                    Retour du client
                  </span>
                </div>
                {b.retour_client ? (
                  <div style={{ marginTop: 9, fontSize: 14.5, lineHeight: 1.6, color: NAVY, fontWeight: 600 }}>
                    « {b.retour_client} »
                  </div>
                ) : (
                  <div style={{ marginTop: 7, fontSize: 13, color: '#94a3b8', lineHeight: 1.55 }}>
                    Il n&apos;a pas laissé de mot.{b.badge_retour === 'refuse' ? ' Un appel dirait ce qui a bloqué — c’est ce qui manque pour affiner la recherche.' : ''}
                  </div>
                )}
              </div>
            )}

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

              {/* en mode sélection, l'observation du chasseur reste ici */}
              {!aRepondu && b.retour_client && (
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
                      <Action href={b.pdf_url} ton="neutre">📄&nbsp; Fiche prête — consulter</Action>
                    ) : b.pdf_statut === 'demande' ? (
                      <Action ton="neutre" disabled>⏳&nbsp; En attente · prochaine session</Action>
                    ) : (
                      <Action onClick={() => demanderPdf(b.id)} ton="neutre">📄&nbsp; Demander une fiche soignée</Action>
                    )}
                    <Action onClick={() => setEnvoi(b)} ton="or">📤&nbsp; Envoyer</Action>
                  </>
                ) : (
                  <>
                    {b.pdf_url && <Action href={b.pdf_url} ton="neutre">📄&nbsp; Le PDF</Action>}
                    <Action onClick={() => onVisite(b.id)} ton="violet">📅&nbsp; Planifier une visite</Action>
                    <Action onClick={() => setObs(b)} ton="navy">💬&nbsp; Noter son retour</Action>
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
          </Fragment>
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
