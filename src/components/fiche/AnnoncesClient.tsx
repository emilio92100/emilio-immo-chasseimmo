'use client';
import { useState, useEffect, useCallback } from 'react';
import { supabase, addJournal } from '@/lib/supabase';
import { verifie } from '@/lib/ecritures';
import { Icone } from './ParcoursBien';
import { siteDe, titreAnnonce, tableAbsente } from '@/lib/annonces-client';
import s from './AnnoncesClient.module.css';

/**
 * « Proposées par <prénom> » — en haut de l'onglet Veille (V3.184).
 *
 * Les annonces que le client a envoyées depuis son espace (« Une annonce
 * repérée ? ») : un lien, des photos, ce qui lui plaît, son mot.
 *   Remplir la fiche → la fenêtre « Ajouter un bien » s'ouvre, le lien et ses
 *                      photos déjà posés (FicheClient) ; enregistrée, la fiche
 *                      part en Sélection et l'annonce est « retenue ».
 *   Écarter…         → avec un mot, qu'il lit dans son espace.
 * Le serveur ne lit jamais le lien : c'est la fenêtre « Ajouter un bien » qui
 * essaie, comme d'habitude, et le texte copié (Ctrl+A) prend le relais.
 *
 * Sans la table (outils/sql/annonces-client.sql pas passé) : rien ne s'affiche.
 */

export type AnnonceCrm = {
  id: string; client_id: string; recherche_id: string; url: string | null; portail: string | null;
  photos: string[] | null; aime: string[] | null; mot: string | null; statut: string;
  reponse: string | null; avis: string | null; decide_le: string | null; bien_id: string | null; created_at: string;
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

export default function AnnoncesClient({ clientId, rechercheId, prenom, rafraichir = 0, onRemplir, onChange }: {
  clientId: string; rechercheId: string; prenom?: string | null; rafraichir?: number;
  onRemplir: (a: AnnonceCrm) => void; onChange?: () => void;
}) {
  const [liste, setListe] = useState<AnnonceCrm[] | null>(null);
  const [ecartees, setEcartees] = useState<AnnonceCrm[]>([]);
  const [voirEcartees, setVoirEcartees] = useState(false);
  const [ecart, setEcart] = useState<string | null>(null);
  const [mot, setMot] = useState('');
  const [enCours, setEnCours] = useState<string | null>(null);
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
    }
    setEnCours(null);
    await charger(); onChange?.();
  }

  async function remettre(a: AnnonceCrm) {
    await verifie('La remise de son annonce', supabase.from('annonces_client').update({
      statut: 'nouveau', reponse: null, decide_le: null,
    }).eq('id', a.id).select('id'), { ligne: true });
    await charger(); onChange?.();
  }

  if (!liste || (liste.length === 0 && ecartees.length === 0)) return null;

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
        <p className={s.note}>{`Envoyées depuis son espace. « Remplir la fiche » : le bien part en Sélection, et ${nom} le retrouve dans « Ça me plaît » quand tu l’envoies. Ou écarte-la avec un mot : il le lira.`}</p>
      )}

      {liste.map(a => {
        const site = siteDe(a.url);
        const photos = (a.photos || []).filter(Boolean);
        const ouvert = ecart === a.id;
        return (
          <div key={a.id} className={s.carte} data-attente={enCours === a.id ? 'oui' : undefined}>
            <div className={s.haut}>
              <span className={s.photo} data-vide={photos[0] ? undefined : 'oui'}>
                {photos[0] ? <img src={photos[0]} alt="" loading="lazy" /> : <span className={s.sans}><Icone nom="lien" taille={22} /></span>}
                {photos.length > 1 && <span className={s.nbPh}><Icone nom="photos" taille={11} epaisseur={2.2} />{photos.length}</span>}
              </span>
              <span className={s.texte}>
                <span className={s.ligne1}>
                  <b>{titreAnnonce(a)}</b>
                  <span className={s.etiq} data-ton={a.url ? (photos.length ? 'deux' : 'lien') : 'photo'}>
                    {a.url ? (photos.length ? `Lien + ${photos.length} photo${photos.length > 1 ? 's' : ''}` : 'Lien seul') : 'Sans lien'}
                  </span>
                  <span className={s.quand}>{depuisQuand(a.created_at)}</span>
                </span>
                {a.url
                  ? <a className={s.url} href={a.url} target="_blank" rel="noopener noreferrer" title={a.url}>{lienCourt(a.url)}</a>
                  : <span className={s.aide}>{'Ses photos deviennent celles de la fiche quand tu la remplis.'}</span>}
                {a.url && site && (
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
              </span>
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
                  <span className={s.ressort} />
                  <button type="button" className={s.bouton} data-ton="rouge" onClick={() => { setEcart(a.id); setMot(''); }} disabled={!!enCours}>Écarter…</button>
                  <button type="button" className={s.bouton} data-ton="or" onClick={() => onRemplir(a)} disabled={!!enCours}>
                    <Icone nom="crayon" taille={15} epaisseur={2} />Remplir la fiche
                  </button>
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
    </section>
  );
}
