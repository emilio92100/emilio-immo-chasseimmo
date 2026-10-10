'use client';
import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/lib/supabase';
import { verifie } from '@/lib/ecritures';
import {
  Chip, BoutonLien, CARTE, ModaleScore, StylesEmilio, NAVY, OR, BORD, verdictDe,
} from './ParcoursBien';
import { telAgence } from '@/lib/rapprochement';
import FenetreBien, { LigneListe, BoutonPied, Ressort, ChampPied, InfoPied } from './FenetreBien';
import { champsChauffage } from '@/lib/chauffage';

/**
 * Onglet Veille — les biens trouvés par la veille, en attente d'arbitrage.
 *   Retenir → passe dans l'onglet Sélection
 *   Écarter → sort de la liste, avec un motif relu par la veille suivante
 *
 * V3.165 : une ligne par bien ; « Voir en grand » ouvre le bien entier
 * (FenetreBien). On y décide, et la fenêtre passe au bien suivant.
 */

interface Props { clientId: string; rechercheId: string; onChange?: () => void; }

export default function OngletVeille({ clientId, rechercheId, onChange }: Props) {
  const [props_, setProps] = useState<any[]>([]);
  const [ecartees, setEcartees] = useState<any[]>([]);
  const [passage, setPassage] = useState<any>(null);
  /* Les critères du client : c'est eux qui font passer une tuile au vert. */
  const [recherche, setRecherche] = useState<any>(null);
  const [chargement, setChargement] = useState(true);
  const [voirEcartees, setVoirEcartees] = useState(false);
  const [ecartEnCours, setEcartEnCours] = useState<string | null>(null);
  const [motif, setMotif] = useState('');
  const [enTraitement, setEnTraitement] = useState<string | null>(null);
  const [scoreOuvert, setScoreOuvert] = useState<any>(null);
  /* V3.165 : le bien ouvert en grand (son id, et sa place dans la liste). */
  const [grand, setGrand] = useState<{ id: string; i: number } | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const minuteur = useRef<number | undefined>(undefined);
  const dire = (m: string) => {
    setMessage(m);
    window.clearTimeout(minuteur.current);
    minuteur.current = window.setTimeout(() => setMessage(null), 2800);
  };
  useEffect(() => () => window.clearTimeout(minuteur.current), []);
  /* « Chargement… » à la première lecture seulement : après un choix, la
     liste se relit sans disparaître (la fenêtre reste ouverte dessus). */
  const dejaLu = useRef(false);
  useEffect(() => { dejaLu.current = false; }, [rechercheId]);

  const charger = useCallback(async () => {
    if (!rechercheId) return;
    if (!dejaLu.current) setChargement(true);
    const [nouv, ecart, pass, rech] = await Promise.all([
      supabase.from('veille_propositions').select('*').eq('recherche_id', rechercheId).eq('statut', 'nouveau')
        .order('score', { ascending: false, nullsFirst: false }).order('created_at', { ascending: false }),
      supabase.from('veille_propositions').select('*').eq('recherche_id', rechercheId).eq('statut', 'ecarte')
        .order('created_at', { ascending: false }).limit(50),
      supabase.from('veille_passages').select('*').eq('recherche_id', rechercheId)
        .order('demarre_le', { ascending: false }).limit(1).maybeSingle(),
      supabase.from('recherches').select('*').eq('id', rechercheId).maybeSingle(),
    ]);
    setProps(nouv.data || []);
    setEcartees(ecart.data || []);
    setPassage(pass.data || null);
    setRecherche(rech.data || null);
    dejaLu.current = true;
    setChargement(false);
  }, [rechercheId]);

  useEffect(() => { charger(); }, [charger]);

  async function retenir(p: any) {
    if (enTraitement) return;
    setEnTraitement(p.id);
    if (p.url) {
      const { data: deja } = await supabase.from('biens').select('id').eq('recherche_id', rechercheId).eq('url', p.url).maybeSingle();
      if (deja) {
        await verifie('Le bien retenu', supabase.from('veille_propositions').update({ statut: 'retenu', bien_id: deja.id, decide_le: new Date().toISOString() }).eq('id', p.id));
        setEnTraitement(null); dire('Déjà dans sa sélection.'); charger(); onChange?.(); return;
      }
    }
    const aPoser: Record<string, any> = {
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
      // les charges et la taxe foncière suivent le bien jusqu'à l'espace du client
      charges_trimestrielles: p.charges_trimestrielles ?? null, taxe_fonciere: p.taxe_fonciere ?? null,
      // ce que couvrent les charges suit le montant
      ...(p.charges_comprises ? { charges_comprises: p.charges_comprises } : {}),
      // V3.171 : le chauffage (collectif ou individuel, énergie, diffusion)
      ...champsChauffage(p),
      // le plan suit le bien ; la colonne n'est écrite que s'il y en a un
      ...(Array.isArray(p.plans) && p.plans.length ? { plans: p.plans } : {}),
      source_portail: p.portail || 'Veille', agence_nom: p.agence || null, badge_retour: 'propose',
      // V3.165 : le numéro de l'agence suit le bien (bouton « Appeler »)
      agence_tel: telAgence(p),
      etape: 'selection', yanport_id: p.yanport_id || null, est_particulier: p.est_particulier || false,
      // infos marché — elles suivent le bien dans la Sélection
      // les anciennes propositions n'ont que `date_annonce` (§6.14)
      date_publication: p.date_publication || p.date_annonce || null, prix_initial: p.prix_initial || null,
      nb_baisses: p.nb_baisses || null, nb_agences: p.nb_agences || null,
      historique_prix: p.historique_prix || [], date_derniere_baisse: p.date_derniere_baisse || null,
      score: p.score ?? null, points_forts: p.points_forts || null, points_attention: p.points_attention || null,
      // l'appréciation suit le bien en Sélection
      verdict: p.verdict ?? null, appreciation: p.appreciation ?? null,
    };

    /* `verdict` et `appreciation` sont récents : tant que la colonne n'existe
       pas encore côté `biens`, on repose le bien sans elles plutôt que de
       bloquer le bouton Retenir. */
    let { data: bien, error } = await supabase.from('biens').insert(aPoser).select().single();
    if (error && /verdict|appreciation/i.test(error.message || '')) {
      delete aPoser.verdict; delete aPoser.appreciation;
      ({ data: bien, error } = await supabase.from('biens').insert(aPoser).select().single());
    }

    if (error || !bien) { alert("Impossible d'ajouter ce bien : " + (error?.message || '')); setEnTraitement(null); return; }
    await verifie('Le bien est ajouté, mais la veille', supabase.from('veille_propositions').update({ statut: 'retenu', bien_id: bien.id, decide_le: new Date().toISOString() }).eq('id', p.id));
    await verifie('L’historique du client', supabase.from('journal').insert({
      client_id: clientId, bien_id: bien.id, recherche_id: rechercheId,
      type: 'veille_trouve', titre: `Trouvé par la veille${p.score ? ` · score ${p.score}/100` : ''}`,
      description: p.points_forts?.join(' · ') || null, metadata: {},
    }));
    /* Une seule ligne au journal : un `addJournal('bien_ajoute')` la doublait
       à chaque « Retenir », sans recherche ni bien (§6.14). */
    setEnTraitement(null); dire('Retenu : il passe dans Sélection.'); charger(); onChange?.();
  }

  async function ecarter(p: any) {
    if (enTraitement) return;
    setEnTraitement(p.id);
    if (!(await verifie('L’écart du bien', supabase.from('veille_propositions').update({
      statut: 'ecarte', motif_ecart: motif.trim() || null, decide_le: new Date().toISOString(),
    }).eq('id', p.id).select('id'), { ligne: true }))) { setEnTraitement(null); return; }
    setEcartEnCours(null); setMotif(''); setEnTraitement(null); dire('Écarté : la veille s’en souviendra.'); charger(); onChange?.();
  }

  async function restaurer(p: any) {
    await verifie('La remise en proposition', supabase.from('veille_propositions').update({ statut: 'nouveau', motif_ecart: null, decide_le: null }).eq('id', p.id).select('id'), { ligne: true });
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

  /* Sans recherche, rien à charger : l'onglet restait sur « Chargement… »
     pour toujours (§6.14). */
  if (!rechercheId) {
    return <div style={{ padding: 48, textAlign: 'center', color: '#94a3b8', fontSize: 14, minHeight: 200 }}>{'Pas encore de recherche sur ce dossier : la veille démarre dès qu’une recherche est ouverte.'}</div>;
  }
  if (chargement) {
    return <div style={{ padding: 48, textAlign: 'center', color: '#b6c1d1', fontSize: 14, minHeight: 200 }}>Chargement de la veille…</div>;
  }

  /* Le liseré de gauche d'une ligne : le verdict de la veille. */
  const railDe = (p: any) => {
    const v = verdictDe(p);
    return v === 'priorite' ? '#16a34a' : v === 'appeler' ? OR : v === 'reserve' ? '#d97706' : '#94a3b8';
  };
  /* Le bien ouvert en grand : s'il quitte la liste (retenu, écarté), la
     fenêtre montre celui qui prend sa place, et se ferme sur une liste vide. */
  const idxGrand = grand
    ? (() => { const j = props_.findIndex(p => p.id === grand.id); return j >= 0 ? j : Math.min(grand.i, props_.length - 1); })()
    : -1;
  const ouvrir = (id: string) => setGrand({ id, i: Math.max(0, props_.findIndex(p => p.id === id)) });
  const allerA = (j: number) => {
    const p = props_[j];
    if (p) { setGrand({ id: p.id, i: j }); setEcartEnCours(null); setMotif(''); }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <StylesEmilio />

      <div className="emi-arrivee" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, flexWrap: 'wrap' }}>
          <span className="emi-titre-onglet" style={{ fontSize: 19, fontWeight: 800, color: NAVY, letterSpacing: -0.3 }}>
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
        <div className="emi-arrivee" style={{ ...CARTE, padding: '48px 20px', textAlign: 'center' }}>
          <div style={{ fontSize: 30, marginBottom: 12 }}>🔎</div>
          <div style={{ fontWeight: 700, color: NAVY, marginBottom: 5, fontSize: 15.5 }}>Rien de nouveau pour l&apos;instant</div>
          <div style={{ color: '#94a3b8', fontSize: 13.5 }}>
            {passage?.termine_le ? "La dernière veille n'a rien trouvé qui corresponde." : "La veille n'a pas encore tourné sur cette recherche."}
          </div>
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
        {props_.map(p => (
          <LigneListe key={p.id} b={p} accent={railDe(p)} attente={enTraitement === p.id}
            onOuvrir={() => ouvrir(p.id)} prix={euros(p.prix)}
            sousPrix={p.prix && p.surface ? `${Math.round(p.prix / Number(p.surface)).toLocaleString('fr-FR')} €/m²` : null} />
        ))}
      </div>

      {grand && idxGrand >= 0 && (
        <FenetreBien biens={props_} index={idxGrand} onIndex={allerA}
          onFermer={() => { setGrand(null); setEcartEnCours(null); setMotif(''); }}
          recherche={recherche} message={message} onScore={p => setScoreOuvert(p)}
          prix={p => ({
            montant: p.prix,
            dessous: p.prix && p.surface ? <span>{`${Math.round(p.prix / Number(p.surface)).toLocaleString('fr-FR')} €/m²`}</span> : null,
          })}
          coinPhoto={p => (p.est_particulier
            ? <span style={{ background: '#10b981', color: 'white', borderRadius: 9, padding: '5px 11px', fontSize: 12, fontWeight: 800, boxShadow: '0 4px 12px -4px rgba(16,185,129,.9)' }}>Particulier</span>
            : undefined)}
          pied={p => (ecartEnCours === p.id ? (
            <>
              <ChampPied autoFocus value={motif} onChange={e => setMotif(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') void ecarter(p); }}
                aria-label="Pourquoi l’écarter ?" placeholder="Pourquoi l’écarter ? Les prochaines veilles le liront." />
              <BoutonPied onClick={() => { setEcartEnCours(null); setMotif(''); }}>Annuler</BoutonPied>
              <BoutonPied ton="navy" onClick={() => { void ecarter(p); }} disabled={!!enTraitement}>Écarter</BoutonPied>
            </>
          ) : (
            <>
              <InfoPied>{`${p.type_bien || 'Bien'}${p.code_postal ? ` · ${p.code_postal}` : ''}${p.portail ? ` · repéré sur ${p.portail}` : ''}`}</InfoPied>
              <Ressort />
              <BoutonPied ton="rouge" onClick={() => { setEcartEnCours(p.id); setMotif(''); }} disabled={!!enTraitement}>Écarter</BoutonPied>
              <BoutonPied ton="or" onClick={() => { void retenir(p); }} disabled={!!enTraitement}>Retenir</BoutonPied>
            </>
          ))} />
      )}

      {scoreOuvert && <ModaleScore p={scoreOuvert} recherche={recherche} onFerme={() => setScoreOuvert(null)} />}

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
