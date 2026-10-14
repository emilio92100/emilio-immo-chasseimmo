'use client';
import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase, addJournal } from '@/lib/supabase';
import { verifie, signalerEchec } from '@/lib/ecritures';
import { Icone, Appreciation, BilanBien, OR } from './ParcoursBien';
import FenetreBien, { BoutonPied, ChampPied, Ressort, InfoPied } from './FenetreBien';
import { siteDe, titreAnnonce, tableAbsente } from '@/lib/annonces-client';
import { analyserFiche, aUneAnalyse, sansAnalyse } from '@/lib/analyse-bien';
import s from './AnnoncesClient.module.css';

/**
 * « Proposées par <prénom> » — en haut de l'onglet Veille (V3.184).
 *
 * Les annonces que le client a envoyées depuis son espace (« Une annonce
 * repérée ? ») : un lien, des photos, ce qui lui plaît, son mot.
 *   Remplir la fiche → la fenêtre « Ajouter un bien » s'ouvre, le lien et ses
 *                      photos déjà posés (FicheClient). V3.185 (choix A
 *                      d'Alexandre) : enregistrée, la fiche RESTE ici, gardée
 *                      sur l'annonce (`fiche`) ; « Modifier la fiche » la rouvre.
 *   Retenir          → le bien est créé en Sélection, l'annonce « retenue ».
 *   Écarter…         → avec un mot, qu'il lit dans son espace.
 * Le serveur ne lit jamais le lien au moment de l'envoi : c'est la fenêtre
 * « Ajouter un bien » qui le lit, et le texte copié (Ctrl+A) prend le relais.
 *
 * V3.186 (Alexandre : « comme ça, c'est calculé… comme si c'était une
 * veille ») : la fiche enregistrée est analysée par rapport à SA recherche,
 * avec les règles de la veille (api/analyse-bien) — une note sur 100, un
 * verdict, une phrase, les atouts, ce qu'il faut vérifier ou trancher. Ils
 * s'affichent sur la carte et dans « Voir en grand » (la même fenêtre que les
 * biens de la veille), et suivent le bien à « Retenir ».
 *
 * Sans la table (outils/sql/annonces-client.sql pas passé) : rien ne s'affiche.
 */

export type AnnonceCrm = {
  id: string; client_id: string; recherche_id: string; url: string | null; portail: string | null;
  photos: string[] | null; aime: string[] | null; mot: string | null; statut: string;
  reponse: string | null; avis: string | null; decide_le: string | null; bien_id: string | null; created_at: string;
  /** V3.185 : la fiche remplie, pas encore retenue (la ligne `biens` à poser).
      V3.186 : avec l'analyse (score, verdict, appreciation, points_forts, points_attention). */
  fiche?: Record<string, any> | null;
};

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

/* L'adresse, lisible : sans https:// ni www., coupée proprement. */
const lienCourt = (u: string) => u.replace(/^https?:\/\/(www\d?\.)?/i, '').replace(/\/$/, '');

const couleurNote = (n: number) => (n >= 85 ? '#16a34a' : n >= 70 ? OR : n >= 50 ? '#d97706' : '#dc2626');

/* Deux fiches identiques, quel que soit l'ordre des champs (la base les
   range à sa façon) et sans leur analyse. */
function stable(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(stable).join(',')}]`;
  if (v && typeof v === 'object') return `{${Object.keys(v as object).sort().map(k => `${JSON.stringify(k)}:${stable((v as Record<string, unknown>)[k])}`).join(',')}}`;
  return JSON.stringify(v ?? null);
}
const memeFiche = (a: Record<string, unknown>, b: Record<string, unknown>) => stable(sansAnalyse(a)) === stable(sansAnalyse(b));

type EtatAnalyse = { etat: 'encours' } | { etat: 'erreur'; erreur: string };

/* Les analyses en cours, hors du composant : l'onglet quitté puis rouvert
   rejoint celle qui tourne au lieu d'en lancer une seconde. La promesse rend
   l'erreur, ou rien quand tout s'est bien passé. */
const EN_COURS = new Map<string, Promise<string | undefined>>();

export default function AnnoncesClient({ clientId, rechercheId, prenom, recherche, rafraichir = 0, analyser: demande, onRemplir, onChange }: {
  clientId: string; rechercheId: string; prenom?: string | null; rafraichir?: number;
  /** la recherche, pour colorer les caractéristiques dans « Voir en grand » */
  recherche?: any;
  /** V3.186 : une fiche vient d'être enregistrée (FicheClient) : on l'analyse. */
  analyser?: { id: string; n: number } | null;
  onRemplir: (a: AnnonceCrm) => void; onChange?: () => void;
}) {
  const [liste, setListe] = useState<AnnonceCrm[] | null>(null);
  const [ecartees, setEcartees] = useState<AnnonceCrm[]>([]);
  const [voirEcartees, setVoirEcartees] = useState(false);
  const [ecart, setEcart] = useState<string | null>(null);
  const [mot, setMot] = useState('');
  const [enCours, setEnCours] = useState<string | null>(null);
  const [dit, setDit] = useState<string | null>(null);
  const [analyses, setAnalyses] = useState<Record<string, EtatAnalyse>>(
    () => Object.fromEntries([...EN_COURS.keys()].map(id => [id, { etat: 'encours' } as EtatAnalyse])));
  const [grand, setGrand] = useState<{ id: string; i: number } | null>(null);
  const [messageGrand, setMessageGrand] = useState<string | null>(null);
  const dejaDemande = useRef(0);
  const nom = (prenom || '').trim() || 'le client';

  const charger = useCallback(async () => {
    if (!rechercheId) return;
    const [nouv, ec] = await Promise.all([
      supabase.from('annonces_client').select('*').eq('recherche_id', rechercheId).eq('statut', 'nouveau')
        .order('created_at', { ascending: false }),
      supabase.from('annonces_client').select('*').eq('recherche_id', rechercheId).eq('statut', 'ecarte')
        .order('decide_le', { ascending: false, nullsFirst: false }).limit(30),
    ]);
    if (nouv.error) { if (!tableAbsente(nouv.error)) console.error('[annonces du client]', nouv.error.message); setListe([]); return; }
    setListe((nouv.data || []) as AnnonceCrm[]);
    setEcartees((ec.data || []) as AnnonceCrm[]);
  }, [rechercheId]);
  useEffect(() => { void charger(); }, [charger, rafraichir]);

  /* L'analyse d'une fiche, comme la veille. Relue juste avant (la fiche
     vient peut-être d'être enregistrée), et gardée seulement si la fiche n'a
     pas changé entre-temps : sinon, la nouvelle fiche a sa propre analyse.
     `siBesoin` : rien à faire si la fiche est déjà analysée (l'onglet rouvert
     après un enregistrement). */
  const analyser = useCallback(async (id: string, siBesoin = false) => {
    setAnalyses(m => ({ ...m, [id]: { etat: 'encours' } }));
    let tache = EN_COURS.get(id);
    if (!tache) {
      tache = (async (): Promise<string | undefined> => {
        const { data: lu, error } = await supabase.from('annonces_client').select('fiche').eq('id', id).maybeSingle();
        const f0 = (lu as { fiche?: Record<string, unknown> | null } | null)?.fiche;
        if (error || !f0 || typeof f0 !== 'object') return error?.message || 'la fiche est introuvable';
        if (siBesoin && aUneAnalyse(f0)) return undefined;
        const base = sansAnalyse(f0);
        const r = await analyserFiche(rechercheId, base, id);
        if (!r.ok) return r.erreur;
        const { data: frais } = await supabase.from('annonces_client').select('fiche').eq('id', id).maybeSingle();
        const f1 = (frais as { fiche?: Record<string, unknown> | null } | null)?.fiche;
        if (!f1 || typeof f1 !== 'object' || !memeFiche(f1, base)) return undefined;
        const ok = await verifie('L’analyse de son annonce', supabase.from('annonces_client')
          .update({ fiche: { ...f1, ...r.analyse } }).eq('id', id).select('id'), { ligne: true });
        return ok ? undefined : 'elle n’a pas été enregistrée';
      })().catch(e => (e as Error).message || 'erreur');
      EN_COURS.set(id, tache);
      void tache.finally(() => EN_COURS.delete(id));
    }
    const erreur = await tache;
    setAnalyses(m => {
      const x = { ...m };
      if (erreur) x[id] = { etat: 'erreur', erreur }; else delete x[id];
      return x;
    });
    await charger();
  }, [rechercheId, charger]);

  /* Une fiche vient d'être enregistrée : son analyse part tout de suite.
     Et celles qui tournaient quand l'onglet a été quitté : on les rejoint. */
  useEffect(() => {
    if (!demande?.id || demande.n === dejaDemande.current) return;
    dejaDemande.current = demande.n;
    void analyser(demande.id, true);
  }, [demande?.id, demande?.n, analyser]);
  useEffect(() => {
    for (const id of [...EN_COURS.keys()]) void analyser(id, true);
  }, [analyser]);

  async function ecarter(a: AnnonceCrm) {
    if (enCours) return;
    setEnCours(a.id);
    const reponse = mot.trim() || null;
    const ok = await verifie('L’écart de son annonce', supabase.from('annonces_client').update({
      statut: 'ecarte', reponse, decide_le: new Date().toISOString(),
    }).eq('id', a.id).select('id'), { ligne: true });
    if (ok) {
      await addJournal(clientId, 'annonce_client', `📩 Son annonce écartée — ${titreAnnonce(a)}`,
        reponse ? `Ton mot, qu’il lit dans son espace : « ${reponse} »` : 'Sans mot : il lit seulement qu’elle n’est pas retenue.',
        { annonce_id: a.id }, { rechercheId });
      setEcart(null); setMot('');
      setMessageGrand('Écartée : il lira ton mot dans son espace.');
    }
    setEnCours(null);
    await charger(); onChange?.();
  }

  /* « Retenir » : la fiche remplie devient un bien de sa Sélection, avec son
     analyse (comme un bien de la veille). Le même lien déjà dans le dossier :
     l'annonce y est rattachée, rien n'est créé. */
  async function retenir(a: AnnonceCrm) {
    const f = a.fiche;
    if (!f || enCours) return;
    setEnCours(a.id);
    let bienId: string | null = null;
    if (f.url) {
      const { data: ex } = await supabase.from('biens').select('id').eq('recherche_id', rechercheId).eq('url', f.url).maybeSingle();
      if (ex) bienId = (ex as { id: string }).id;
    }
    const deja = !!bienId;
    if (!bienId) {
      const aPoser: Record<string, any> = { ...f, client_id: clientId, recherche_id: rechercheId, etape: 'selection', badge_retour: 'propose' };
      let { data: b, error } = await supabase.from('biens').insert(aPoser).select('id').single();
      /* `verdict` et `appreciation` sont récents côté `biens` : sans ces
         colonnes, le bien part sans elles plutôt que de bloquer (OngletVeille). */
      if (error && /verdict|appreciation/i.test(error.message || '')) {
        delete aPoser.verdict; delete aPoser.appreciation;
        ({ data: b, error } = await supabase.from('biens').insert(aPoser).select('id').single());
      }
      if (error || !b) { signalerEchec('Le bien tiré de son annonce', error?.message || 'aucune ligne créée'); setEnCours(null); return; }
      bienId = (b as { id: string }).id;
      const note = aUneAnalyse(f) ? ` · note ${Math.round(Number(f.score))}/100` : '';
      await addJournal(clientId, 'bien_ajoute', `🏠 Bien ajouté — ${f.titre || f.ville || ''} (son annonce, retenue${note})`,
        [f.url || '', f.appreciation || ''].filter(Boolean).join('\n'), undefined, { rechercheId, bienId });
    }
    const ok = await verifie('Son annonce, retenue', supabase.from('annonces_client').update({
      statut: 'retenu', bien_id: bienId, decide_le: new Date().toISOString(),
    }).eq('id', a.id).select('id'), { ligne: true });
    setEnCours(null);
    await charger(); onChange?.();
    if (ok) {
      const m = deja ? 'Ce bien était déjà dans son dossier : son annonce y est rattachée.' : `Retenue : « ${f.titre || 'le bien'} » est dans Sélection.`;
      setDit(m); setMessageGrand(deja ? 'Déjà dans son dossier : rattachée.' : 'Retenue : elle passe dans Sélection.');
      window.setTimeout(() => setDit(null), 3500);
    }
  }

  async function remettre(a: AnnonceCrm) {
    await verifie('La remise de son annonce', supabase.from('annonces_client').update({
      statut: 'nouveau', reponse: null, decide_le: null,
    }).eq('id', a.id).select('id'), { ligne: true });
    await charger(); onChange?.();
  }

  if (!liste || (liste.length === 0 && ecartees.length === 0)) return null;

  /* « Voir en grand » : les fiches remplies, dans la fenêtre des biens de la
     veille. Une annonce qui part (retenue, écartée) laisse la place à la
     suivante ; la fenêtre se ferme quand il n'y en a plus. */
  const fiches = liste.filter(a => a.fiche && typeof a.fiche === 'object')
    .map(a => ({ ...(a.fiche as Record<string, any>), id: a.id, _annonce: a }));
  const idxGrand = grand
    ? (() => { const j = fiches.findIndex(x => x.id === grand.id); return j >= 0 ? j : Math.min(grand.i, fiches.length - 1); })()
    : -1;
  const ouvrir = (id: string) => { setMessageGrand(null); setGrand({ id, i: Math.max(0, fiches.findIndex(x => x.id === id)) }); };
  const allerA = (j: number) => { const x = fiches[j]; if (x) { setGrand({ id: x.id, i: j }); setEcart(null); setMot(''); } };
  const fermerGrand = () => { setGrand(null); setEcart(null); setMot(''); setMessageGrand(null); };

  /* L'analyse sur la carte : en cours, faite, ratée, ou à lancer. */
  const blocAnalyse = (a: AnnonceCrm, f: Record<string, any>) => {
    const st = analyses[a.id];
    if (st?.etat === 'encours') {
      return (
        <div className={s.analyse} data-etat="encours" role="status">
          <span className={s.rond} aria-hidden="true" />
          <span>{`Analyse par rapport à sa recherche, comme la veille… (une vingtaine de secondes)`}</span>
        </div>
      );
    }
    if (aUneAnalyse(f)) {
      const n = Math.round(Number(f.score));
      return (
        <div className={s.avis}>
          <div className={s.avisLigne}>
            <button type="button" className={s.noteA} style={{ ['--c' as string]: couleurNote(n) }} onClick={() => ouvrir(a.id)}
              title="Voir l’analyse en grand" aria-label={`Note ${n} sur 100 : voir l’analyse en grand`}>
              <b>{n}</b><small>/100</small>
            </button>
            <div className={s.avisTexte}><Appreciation p={f} /></div>
          </div>
          <BilanBien p={f} />
        </div>
      );
    }
    if (st?.etat === 'erreur') {
      return (
        <div className={s.analyse} data-etat="erreur">
          <Icone nom="alerte" taille={15} epaisseur={2.1} />
          <span>{`L’analyse n’a pas pu se faire : ${st.erreur}`}</span>
          <button type="button" className={s.relancer} onClick={() => { void analyser(a.id); }}>Relancer</button>
        </div>
      );
    }
    return (
      <button type="button" className={s.analyser} onClick={() => { void analyser(a.id); }}>
        <Icone nom="loupe" taille={15} epaisseur={2.1} />{'Analyser par rapport à sa recherche'}
      </button>
    );
  };

  return (
    <section className={s.bloc} aria-label={`Annonces proposées par ${nom}`}>
      <div className={s.tete}>
        <span className={s.teteIc}><Icone nom="lien" taille={17} epaisseur={2} /></span>
        <b className={s.titre}>{`Proposées par ${nom}`}</b>
        {liste.length > 0 && <span className={s.nb}>{liste.length}</span>}
        {ecartees.length > 0 && (
          <button type="button" className={s.lienEc} onClick={() => setVoirEcartees(v => !v)} aria-expanded={voirEcartees}>
            {voirEcartees ? 'Masquer les écartées' : `${ecartees.length} écartée${ecartees.length > 1 ? 's' : ''}`}
          </button>
        )}
      </div>
      {liste.length > 0 && (
        <p className={s.note}>{`Envoyées depuis son espace. « Remplir la fiche » prépare le bien, qui reste ici, et l’analyse par rapport à sa recherche, comme la veille. Puis « Retenir » : il part en Sélection, et ${nom} le retrouve dans « Ça me plaît » quand tu l’envoies. Ou « Écarter… » avec un mot : il le lira.`}</p>
      )}
      {dit && <div className={s.dit} role="status">{dit}</div>}

      {liste.map(a => {
        const site = siteDe(a.url);
        const photos = (a.photos || []).filter(Boolean);
        const ouvert = ecart === a.id && !grand;
        /* V3.185 : la fiche remplie (photos, prix, surface…) passe devant. */
        const f = a.fiche && typeof a.fiche === 'object' ? a.fiche : null;
        const photosF: string[] = f && Array.isArray(f.photos) ? f.photos.filter(Boolean) : [];
        const vues = photosF.length ? photosF : photos;
        const prixF = f ? Number(f.prix_acquereur || f.prix_vendeur) || null : null;
        const puces = f ? [
          f.surface ? `${f.surface} m²` : null, f.nb_pieces ? `${f.nb_pieces} p.` : null,
          f.nb_chambres ? `${f.nb_chambres} ch.` : null,
          f.etage != null && f.etage !== '' ? (Number(f.etage) === 0 ? 'RDC' : Number(f.etage) === 1 ? '1er étage' : `${f.etage}e étage`) : null,
          f.dpe ? `DPE ${f.dpe}` : null,
        ].filter((x): x is string => !!x) : [];
        const analyseEnCours = analyses[a.id]?.etat === 'encours';
        return (
          <div key={a.id} className={s.carte} data-attente={enCours === a.id ? 'oui' : undefined}>
            <div className={s.haut}>
              <span className={s.photo} data-vide={vues[0] ? undefined : 'oui'}>
                {vues[0] ? <img src={vues[0]} alt="" loading="lazy" /> : <span className={s.sans}><Icone nom="lien" taille={22} /></span>}
                {vues.length > 1 && <span className={s.nbPh}><Icone nom="photos" taille={11} epaisseur={2.2} />{vues.length}</span>}
              </span>
              <div className={s.texte}>
                <span className={s.ligne1}>
                  <b>{(f && f.titre) || titreAnnonce(a)}</b>
                  {f
                    ? <span className={s.etiq} data-ton="fiche">Fiche remplie</span>
                    : <span className={s.etiq} data-ton={a.url ? (photos.length ? 'deux' : 'lien') : 'photo'}>
                      {a.url ? (photos.length ? `Lien + ${photos.length} photo${photos.length > 1 ? 's' : ''}` : 'Lien seul') : 'Sans lien'}
                    </span>}
                  <span className={s.quand}>{depuisQuand(a.created_at)}</span>
                </span>
                {f && (
                  <span className={s.fiche}>
                    {(f.quartier || f.ville) && <span className={s.lieu}><Icone nom="lieu" taille={13} />{[f.quartier, f.ville].filter(Boolean).join(', ')}</span>}
                    {prixF && <b className={s.prixF}>{`${prixF.toLocaleString('fr-FR')} €`}</b>}
                    {puces.length > 0 && <span className={s.puces}>{puces.map(x => <span key={x} className={s.puce}>{x}</span>)}</span>}
                  </span>
                )}
                {f && blocAnalyse(a, f)}
                {a.url
                  ? <a className={s.url} href={a.url} target="_blank" rel="noopener noreferrer" title={a.url}>{lienCourt(a.url)}</a>
                  : !f && <span className={s.aide}>{'Ses photos deviennent celles de la fiche quand tu la remplis.'}</span>}
                {!f && a.url && site && (
                  <span className={s.aide}>{site.connu
                    ? `Si ${site.nom} ne laisse pas lire la page : ouvre l’annonce, Ctrl+A, Ctrl+C, et colle le texte dans la fenêtre (le lien est déjà mis).`
                    : 'La fenêtre essaie de lire la page ; sinon, Ctrl+A et Ctrl+C sur l’annonce, puis colle le texte.'}</span>
                )}
                {(a.mot || (a.aime || []).length > 0) && (
                  <span className={s.mot}>
                    <i>Son mot</i>
                    {a.mot ? <span>{`« ${a.mot} »`}</span> : <span className={s.vide}>Pas de mot.</span>}
                    {(a.aime || []).length > 0 && <small>{`Ce qui lui plaît : ${(a.aime || []).join(', ').toLowerCase()}`}</small>}
                  </span>
                )}
                {photos.length > 0 && (
                  <span className={s.vigs}>
                    {photos.map((p, i) => (
                      <a key={i} href={p} target="_blank" rel="noopener noreferrer" className={s.vig} title="Voir la photo en grand">
                        <img src={p} alt="" loading="lazy" />
                      </a>
                    ))}
                  </span>
                )}
              </div>
            </div>
            <div className={s.pied}>
              {ouvert ? (
                <>
                  <input className={s.champ} autoFocus value={mot} onChange={e => setMot(e.target.value)} maxLength={400}
                    onKeyDown={e => { if (e.key === 'Enter') void ecarter(a); if (e.key === 'Escape') { setEcart(null); setMot(''); } }}
                    aria-label="Ton mot pour lui"
                    placeholder={`Ton mot pour ${nom}, qu’il lira dans son espace (facultatif) : déjà vendu, trop de travaux…`} />
                  <button type="button" className={s.bouton} onClick={() => { setEcart(null); setMot(''); }}>Annuler</button>
                  <button type="button" className={s.bouton} data-ton="navy" onClick={() => { void ecarter(a); }} disabled={!!enCours}>Écarter</button>
                </>
              ) : (
                <>
                  {a.url && <a className={s.bouton} href={a.url} target="_blank" rel="noopener noreferrer"><Icone nom="lien" taille={15} epaisseur={2} />Ouvrir l’annonce</a>}
                  {f && (
                    <button type="button" className={s.bouton} onClick={() => ouvrir(a.id)}>
                      <Icone nom="agrandir" taille={15} epaisseur={2} />Voir en grand
                    </button>
                  )}
                  <span className={s.ressort} />
                  {f && (
                    <button type="button" className={s.bouton} onClick={() => onRemplir(a)} disabled={!!enCours}>
                      <Icone nom="crayon" taille={15} epaisseur={2} />Modifier la fiche
                    </button>
                  )}
                  <button type="button" className={s.bouton} data-ton="rouge" onClick={() => { setEcart(a.id); setMot(''); }} disabled={!!enCours}>Écarter…</button>
                  {f ? (
                    <button type="button" className={s.bouton} data-ton="or" onClick={() => { void retenir(a); }} disabled={!!enCours || analyseEnCours}
                      title={analyseEnCours ? 'L’analyse est en cours : elle suivra le bien.' : undefined}>
                      <Icone nom="coche" taille={15} epaisseur={2.2} />Retenir
                    </button>
                  ) : (
                    <button type="button" className={s.bouton} data-ton="or" onClick={() => onRemplir(a)} disabled={!!enCours}>
                      <Icone nom="crayon" taille={15} epaisseur={2} />Remplir la fiche
                    </button>
                  )}
                </>
              )}
            </div>
          </div>
        );
      })}

      {voirEcartees && ecartees.map(a => (
        <div key={a.id} className={s.ecartee}>
          <span className={s.ecTitre}>{titreAnnonce(a)}</span>
          <span className={s.ecRep}>{a.reponse ? `Ton mot : « ${a.reponse} »` : 'Sans mot'}</span>
          {a.url && <a className={s.ecLien} href={a.url} target="_blank" rel="noopener noreferrer">Voir</a>}
          <button type="button" className={s.ecLien} onClick={() => { void remettre(a); }}>Remettre</button>
        </div>
      ))}

      {grand && idxGrand >= 0 && fiches[idxGrand] && (
        <FenetreBien biens={fiches} index={idxGrand} onIndex={allerA} onFermer={fermerGrand}
          recherche={recherche} message={messageGrand}
          prix={b => {
            const p = Number(b.prix_acquereur || b.prix_vendeur) || null;
            return { montant: p, dessous: p && b.surface ? <span>{`${Math.round(p / Number(b.surface)).toLocaleString('fr-FR')} €/m²`}</span> : null };
          }}
          bandeau={b => {
            const a = b._annonce as AnnonceCrm;
            const st = analyses[a.id];
            return (
              <div className={s.mot} style={{ marginTop: 0 }}>
                <i>{`Proposée par ${nom} · ${depuisQuand(a.created_at)}`}</i>
                {a.mot ? <span>{`« ${a.mot} »`}</span> : <span className={s.vide}>Pas de mot.</span>}
                {(a.aime || []).length > 0 && <small>{`Ce qui lui plaît : ${(a.aime || []).join(', ').toLowerCase()}`}</small>}
                {st?.etat === 'encours' && <small>{'Analyse par rapport à sa recherche en cours…'}</small>}
                {!aUneAnalyse(b) && st?.etat !== 'encours' && <small>{'Pas encore analysée : « Analyser » sur sa carte.'}</small>}
              </div>
            );
          }}
          pied={b => {
            const a = b._annonce as AnnonceCrm;
            return ecart === a.id ? (
              <>
                <ChampPied autoFocus value={mot} onChange={e => setMot(e.target.value)} maxLength={400}
                  onKeyDown={e => { if (e.key === 'Enter') void ecarter(a); }}
                  aria-label="Ton mot pour lui" placeholder={`Ton mot pour ${nom}, qu’il lira (facultatif)`} />
                <BoutonPied onClick={() => { setEcart(null); setMot(''); }}>Annuler</BoutonPied>
                <BoutonPied ton="navy" onClick={() => { void ecarter(a); }} disabled={!!enCours}>Écarter</BoutonPied>
              </>
            ) : (
              <>
                <InfoPied>{`${b.type_bien || 'Bien'}${b.code_postal ? ` · ${b.code_postal}` : ''} · son annonce`}</InfoPied>
                <Ressort />
                <BoutonPied onClick={() => { fermerGrand(); onRemplir(a); }} disabled={!!enCours}>Modifier la fiche</BoutonPied>
                <BoutonPied ton="rouge" onClick={() => { setEcart(a.id); setMot(''); }} disabled={!!enCours}>Écarter…</BoutonPied>
                <BoutonPied ton="or" onClick={() => { void retenir(a); }} disabled={!!enCours || analyses[a.id]?.etat === 'encours'}>Retenir</BoutonPied>
              </>
            );
          }} />
      )}
    </section>
  );
}
