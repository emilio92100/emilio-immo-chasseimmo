'use client';
import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { etapeDe, nomProprio, type BienVente, type Donnees } from '@/lib/biens-vente';
import { valeursBien, COLS_BIEN, type CopieBien } from './BonDeVisite';
import { Ic } from './ApercuActe';
import s from './Documents.module.css';

/* ═══ Ajouter un bien à un bon de visite (V3.157) ══════════════════════════
   Alexandre : « quand je fais Ajouter un bien, comment il fait le lien avec
   un mandat que j'ai ? Il faut que ça propose : depuis vos mandats — je
   tape la référence, le nom du propriétaire ou une adresse, ça le retrouve
   avec la photo et je clique ; ou un bien que j'ajoute moi-même, en
   indiquant qu'il n'y aura pas de suivi possible ».

   Trois chemins :
     · « Un de mes mandats » : les biens en vente de l'agence (pas archivés),
       cherchés par référence, propriétaire, adresse ou ville ;
     · « Un bien de son dossier » (un bon qui a son client) : les biens de
       l'acheteur, ceux des autres agences compris ;
     · « À la main » : une carte vide, sans lien — ni vignette dans
       l'historique, ni place sur une fiche de bien.
   Un bien choisi remplit sa carte (adresse, ville, description, prix de
   l'annonce, référence) et garde son lien (`bienId`, `bienVenteId`), comme
   un bon préparé depuis une visite. Au niveau du module (AGENTS.md §2.4). */

type Vente = Pick<BienVente, 'id' | 'reference' | 'etape' | 'titre' | 'adresse' | 'code_postal' | 'ville' | 'prix' | 'photo' | 'client_id'> & {
  proprietaires?: unknown; qui?: unknown; sciNom?: unknown;
};
type Copie = CopieBien & { photos?: unknown };
type Chemin = 'choix' | 'mandats' | 'dossier';

const sansAccent = (t: string) => t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const EUR = (n: number | null | undefined) => (n ? `${Math.round(n).toLocaleString('fr-FR').replace(/[  ]/g, ' ')} €` : '');
const photoCopie = (b: Copie): string => (Array.isArray(b.photos) ? String(b.photos.find((x: unknown) => typeof x === 'string' && x) || '') : '');

export default function AjoutBien({ clientId, plein, onAjouter }: {
  /* Le client du bon : ses biens sont proposés. */
  clientId: string | null;
  /* Six biens au plus : plus de bouton. */
  plein: boolean;
  onAjouter: (valeurs: Record<string, unknown>) => void;
}) {
  const [chemin, setChemin] = useState<Chemin | null>(null);
  const [q, setQ] = useState('');
  const [ventes, setVentes] = useState<Vente[] | null>(null);
  const [noms, setNoms] = useState<Record<string, string>>({});
  const [copies, setCopies] = useState<Copie[] | null>(null);
  const [erreur, setErreur] = useState('');
  const [travail, setTravail] = useState('');

  /* Lu une fois, au premier chemin choisi. */
  useEffect(() => {
    if (chemin !== 'mandats' || ventes) return;
    let vivant = true;
    (async () => {
      const { data, error } = await supabase.from('biens_vente')
        .select('id, reference, etape, titre, adresse, code_postal, ville, prix, photo, client_id, proprietaires:donnees->proprietaires, qui:donnees->qui, sciNom:donnees->sciNom')
        .eq('archive', false).order('updated_at', { ascending: false }).limit(400);
      if (!vivant) return;
      if (error) { setErreur('Tes biens n’ont pas pu être lus : ' + error.message); setVentes([]); return; }
      const l = (data || []) as unknown as Vente[];
      setVentes(l);
      /* Le propriétaire : sa fiche quand le bien en a une, sinon le nom noté sur le bien. */
      const ids = [...new Set(l.map(x => x.client_id).filter((x): x is string => !!x))];
      if (ids.length) {
        const r = await supabase.from('clients').select('id, prenom, nom').in('id', ids);
        if (vivant && !r.error) setNoms(Object.fromEntries(((r.data || []) as { id: string; prenom?: string | null; nom?: string | null }[]).map(c => [c.id, `${c.prenom || ''} ${c.nom || ''}`.trim()])));
      }
    })();
    return () => { vivant = false; };
  }, [chemin, ventes]);
  useEffect(() => {
    if (chemin !== 'dossier' || copies || !clientId) return;
    let vivant = true;
    supabase.from('biens').select(`${COLS_BIEN}, photos`).eq('client_id', clientId).order('created_at', { ascending: false }).limit(150)
      .then(({ data, error }) => {
        if (!vivant) return;
        if (error) { setErreur('Les biens de son dossier n’ont pas pu être lus : ' + error.message); setCopies([]); return; }
        setCopies((data || []) as unknown as Copie[]);
      });
    return () => { vivant = false; };
  }, [chemin, copies, clientId]);

  const proprio = (v: Vente) => (v.client_id && noms[v.client_id]) || nomProprio({ proprietaires: v.proprietaires, qui: v.qui, sciNom: v.sciNom } as Donnees);
  const trouvesV = useMemo(() => {
    const t = sansAccent(q.trim());
    const l = ventes || [];
    return (t ? l.filter(v => sansAccent([v.reference, v.titre, v.adresse, v.code_postal, v.ville, proprio(v)].filter(Boolean).join(' ')).includes(t)) : l).slice(0, 40);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ventes, q, noms]);
  const trouvesC = useMemo(() => {
    const t = sansAccent(q.trim());
    const l = copies || [];
    return (t ? l.filter(c => sansAccent([c.titre, c.adresse, c.code_postal, c.ville, c.agence_nom].filter(Boolean).join(' ')).includes(t)) : l).slice(0, 40);
  }, [copies, q]);

  const fermer = () => { setChemin(null); setQ(''); setErreur(''); setTravail(''); };

  /* Un bien choisi : relu en entier (son adresse complète et le prix de son
     annonce sont dans ses réponses), avec sa copie chez l'acheteur s'il en a une. */
  async function choisirVente(v: Vente) {
    setTravail(v.id); setErreur('');
    try {
      const { data, error } = await supabase.from('biens_vente').select('*').eq('id', v.id).single();
      if (error || !data) throw new Error(error?.message || 'introuvable');
      let copie: CopieBien | null = null;
      if (clientId) {
        const r = await supabase.from('biens').select(COLS_BIEN).eq('client_id', clientId).eq('bien_vente_id', v.id).limit(1);
        if (!r.error) copie = ((r.data || []) as unknown as CopieBien[])[0] || null;
      }
      onAjouter(valeursBien(copie, data as BienVente));
      fermer();
    } catch (e) { setErreur('Ce bien n’a pas pu être lu : ' + (e as Error).message); setTravail(''); }
  }
  async function choisirCopie(c: Copie) {
    setTravail(c.id); setErreur('');
    try {
      let bv: BienVente | null = null;
      if (c.bien_vente_id) {
        const { data, error } = await supabase.from('biens_vente').select('*').eq('id', c.bien_vente_id).maybeSingle();
        if (error) throw new Error(error.message);
        bv = (data as BienVente | null) || null;
      }
      onAjouter(valeursBien(c, bv));
      fermer();
    } catch (e) { setErreur('Ce bien n’a pas pu être lu : ' + (e as Error).message); setTravail(''); }
  }

  if (plein) return null;
  if (!chemin) {
    return (
      <button type="button" className={s.ajouter} onClick={() => setChemin('choix')}>
        <Ic n="plus" t={15} e={2.4} />Ajouter un bien
      </button>
    );
  }

  return (
    <div className={s.abCadre}>
      <div className={s.abTete}>
        {chemin !== 'choix' && (
          <button type="button" className={s.abRetour} onClick={() => { setChemin('choix'); setQ(''); setErreur(''); }} aria-label="Revenir au choix">
            <Ic n="retour" t={14} />
          </button>
        )}
        <b>{chemin === 'mandats' ? 'Un de mes mandats' : chemin === 'dossier' ? 'Un bien de son dossier' : 'Quel bien ajouter ?'}</b>
        <button type="button" className={s.abFermer} onClick={fermer}>Annuler</button>
      </div>

      {chemin === 'choix' && (
        <div className={s.abChoix}>
          <button type="button" className={s.abTuile} onClick={() => setChemin('mandats')}>
            <span className={s.abTuileIc}><Ic n="panneau" t={18} /></span>
            <span><b>Depuis mes mandats</b><small>Par sa référence, le nom du propriétaire ou l’adresse.</small></span>
          </button>
          {clientId && (
            <button type="button" className={s.abTuile} onClick={() => setChemin('dossier')}>
              <span className={s.abTuileIc}><Ic n="dossier" t={18} /></span>
              <span><b>Depuis son dossier</b><small>Les biens de l’acheteur, ceux des autres agences compris.</small></span>
            </button>
          )}
          <button type="button" className={s.abTuile} onClick={() => { onAjouter({}); fermer(); }}>
            <span className={s.abTuileIc} data-gris="oui"><Ic n="crayon" t={18} /></span>
            <span><b>Je l’écris moi-même</b><small>Un bien hors du CRM : l’adresse à la main, sans suivi possible.</small></span>
          </button>
        </div>
      )}

      {(chemin === 'mandats' || chemin === 'dossier') && (
        <>
          <input className={s.cherche} autoFocus autoComplete="off" value={q} onChange={e => setQ(e.target.value)}
            placeholder={chemin === 'mandats' ? 'Une référence, un propriétaire, une adresse…' : 'Une adresse, une ville, une agence…'} />
          {(chemin === 'mandats' ? ventes : copies) === null ? <div className={s.chAide}>Chargement…</div> : (
            <div className={`${s.resultats} ${s.abListe}`}>
              {chemin === 'mandats' && trouvesV.map(v => {
                const e = etapeDe(v.etape);
                const qui = proprio(v);
                return (
                  <button key={v.id} type="button" className={s.resultat} disabled={!!travail} onClick={() => { void choisirVente(v); }}>
                    <span className={s.abPhoto} style={v.photo ? { backgroundImage: `url(${v.photo})` } : undefined}>{!v.photo && <Ic n="maison" t={16} />}</span>
                    <span className={s.resDeux}>
                      <b>{v.titre || 'Bien'}</b>
                      <i>{[v.adresse, v.ville].filter(Boolean).join(', ') || 'Adresse non notée'}</i>
                      <i>{[v.reference, qui, EUR(v.prix)].filter(Boolean).join(' · ')}</i>
                    </span>
                    <small style={{ color: e.c }}>{travail === v.id ? '…' : e.court}</small>
                  </button>
                );
              })}
              {chemin === 'dossier' && trouvesC.map(c => {
                const ph = photoCopie(c);
                return (
                  <button key={c.id} type="button" className={s.resultat} disabled={!!travail} onClick={() => { void choisirCopie(c); }}>
                    <span className={s.abPhoto} style={ph ? { backgroundImage: `url(${ph})` } : undefined}>{!ph && <Ic n="maison" t={16} />}</span>
                    <span className={s.resDeux}>
                      <b>{c.titre || 'Bien'}</b>
                      <i>{[c.adresse, c.ville].filter(Boolean).join(', ') || 'Adresse non notée'}</i>
                      <i>{[c.bien_vente_id ? 'Mon mandat' : c.agence_nom || (c.est_particulier ? 'Particulier' : ''), EUR(c.prix_acquereur)].filter(Boolean).join(' · ')}</i>
                    </span>
                    {travail === c.id && <small>…</small>}
                  </button>
                );
              })}
              {(chemin === 'mandats' ? trouvesV.length : trouvesC.length) === 0 && (
                <div className={s.resultat} style={{ cursor: 'default', color: '#64748b' }}>
                  {q.trim() ? 'Aucun bien ne correspond.' : chemin === 'mandats' ? 'Aucun bien en vente pour l’instant.' : 'Aucun bien dans son dossier pour l’instant.'}
                </div>
              )}
            </div>
          )}
        </>
      )}
      {erreur && <div className={s.erreur}>{erreur}</div>}
    </div>
  );
}
