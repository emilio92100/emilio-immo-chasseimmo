'use client';

/* ═══ Importer les biens d'ImmoFacile (V3.79) ════════════════════════════════
   Le bouton « Importer depuis ImmoFacile » de la rubrique Biens. Quatre temps :
     1. le fichier : l'export des biens lu dans ImmoFacile (un .json) ;
     2. l'aperçu : chaque bien, son vendeur retrouvé dans le CRM (ou à
        créer, ou absent), l'étape proposée et pourquoi — modifiable bien par
        bien —, ses photos ; les biens déjà repris sont écartés ; on décoche
        ce qu'on ne veut pas ;
     3. l'import, deux biens à la fois, avec sa barre ;
     4. le compte rendu : créés, complétés, photos copiées, ce qui a manqué.
   La préparation est dans src/lib/import-biens-immofacile.ts, l'écriture
   dans import-biens-ecriture.ts. */

import { useMemo, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { ETAPES_VENTE, etapeDe, nomType, type EtapeVente } from '@/lib/biens-vente';
import { aujourdhuiYmd } from '@/lib/import-immofacile';
import { dejaLa, lireFichierBiens, planifierBiens, resumePlans, type BienCRM, type PlanBien } from '@/lib/import-biens-immofacile';
import { Croix, Ic } from '@/components/documents/ApercuActe';
import { importerBien, lireCRMBiens, type ChoixBien, type EtatCRMBiens, type ResultatBien } from './import-biens-ecriture';
import d from '@/components/documents/Documents.module.css';
import x from './ImportBiensIF.module.css';

type Existant = { bien: BienCRM; pourquoi: 'importe' | 'meme' } | null;
type Ligne = { p: PlanBien; deja: Existant };
type Onglet = 'tous' | EtapeVente | 'deja' | 'sansVendeur';
const fr = (n: number) => n.toLocaleString('fr-FR');
const pl = (n: number, un: string, plusieurs = `${un}s`) => `${fr(n)} ${n > 1 ? plusieurs : un}`;
const EN_PARALLELE = 2;

function resumeBien(p: PlanBien): string {
  const dd = p.donnees;
  const t = typeof dd.typeBien === 'string' ? nomType(dd.typeBien) : 'Bien';
  const pieces = typeof dd.pieces === 'number' && dd.pieces ? `${dd.pieces} p.` : '';
  const surf = typeof dd.surface === 'number' ? `${String(dd.surface).replace('.', ',')} m²` : '';
  return [t, pieces, surf, p.ville].filter(Boolean).join(' · ');
}
const nomVendeur = (p: PlanBien) => (p.trouve ? [p.trouve.client.prenom, p.trouve.client.nom].filter(Boolean).join(' ') : p.vendeur ? [p.vendeur.prenom, p.vendeur.nom].filter(Boolean).join(' ') : '');

function Vendeur({ p, c, onChoix }: { p: PlanBien; c: ChoixBien; onChoix: (y: Partial<ChoixBien>) => void }) {
  if (c.etape === 'annonce_type') return <span className={x.vMuet}><Ic n="megaphone" t={13} />Annonce type, sans vendeur</span>;
  if (p.trouve) return <span className={x.vOk}><Ic n="check" t={13} e={2.6} /><span><b>{nomVendeur(p)}</b><small>{`retrouvé par ${p.trouve.par}${p.trouve.client.archive ? ' · archivé' : ''}`}</small></span></span>;
  if (p.vendeur) {
    return (
      <label className={x.vNeuf}>
        <input type="checkbox" checked={c.creerVendeur} onChange={e => onChoix({ creerVendeur: e.target.checked })} />
        <span><b>{nomVendeur(p) || 'Vendeur sans nom'}</b><small>{c.creerVendeur ? 'pas dans le CRM : sera créé' : 'pas dans le CRM : ne pas le créer'}</small></span>
      </label>
    );
  }
  return <span className={x.vMuet}><Ic n="personne" t={13} />Sans vendeur</span>;
}

function LigneBien({ l, c, onChoix }: { l: Ligne; c: ChoixBien; onChoix: (y: Partial<ChoixBien>) => void }) {
  const { p, deja } = l;
  const importe = deja?.pourquoi === 'importe';
  const e = etapeDe(c.etape);
  return (
    <div className={`${x.ligne} ${!c.importer ? x.ligneOff : ''}`}>
      <label className={x.coche} title={importe ? 'Déjà importé' : c.importer ? 'Ne pas importer' : 'Importer'}>
        <input type="checkbox" checked={c.importer} disabled={importe} onChange={ev => onChoix({ importer: ev.target.checked })} />
      </label>
      <div className={x.bien}>
        <b>{resumeBien(p)}</b>
        <small>
          <span className={x.ref}>{`n° ${p.ref}`}</span>
          <span>{p.statutLib}</span>
          <span className={x.ph}><Ic n="photo" t={12} />{p.photos.length}</span>
          {deja && <span className={x.deja}>{importe ? `Déjà importé : ${deja.bien.reference || 'fiche existante'}` : `Complète ${deja.bien.reference || 'la fiche existante'}`}</span>}
        </small>
      </div>
      <Vendeur p={p} c={c} onChoix={onChoix} />
      <div className={x.etape}>
        <span className={x.point} style={{ background: e.c }} />
        <select value={c.etape} disabled={importe || !c.importer} aria-label={`Étape du bien n° ${p.ref}`}
          onChange={ev => { const et = ev.target.value as EtapeVente; onChoix({ etape: et, archive: et === 'retire' ? c.archive : false }); }}>
          {ETAPES_VENTE.map(y => <option key={y.k} value={y.k}>{y.lib}</option>)}
        </select>
        {c.etape === 'retire' && (
          <label className={x.archive}><input type="checkbox" checked={c.archive} disabled={importe || !c.importer} onChange={ev => onChoix({ archive: ev.target.checked })} />Archivé</label>
        )}
      </div>
      <p className={x.raison}>{p.proposition.etape !== c.etape ? `Proposé : ${etapeDe(p.proposition.etape).lib}. ${p.proposition.raison}` : p.proposition.raison}</p>
    </div>
  );
}

function Tuile({ n, l, ton, children }: { n: number; l: string; ton?: 'or' | 'vert' | 'rouge' | 'gris'; children?: ReactNode }) {
  return <div className={`${x.tuile} ${ton ? x[`t_${ton}`] : ''}`}><b>{fr(n)}</b><span>{l}</span>{children}</div>;
}

export default function ImportBiensIF({ onFermer, onImporte }: { onFermer: () => void; onImporte: () => void }) {
  const [phase, setPhase] = useState<'fichier' | 'lecture' | 'apercu' | 'import' | 'fini'>('fichier');
  const [erreur, setErreur] = useState('');
  const [lignes, setLignes] = useState<Ligne[]>([]);
  const [choix, setChoix] = useState<Record<string, ChoixBien>>({});
  const [onglet, setOnglet] = useState<Onglet>('tous');
  const [cherche, setCherche] = useState('');
  const [resultats, setResultats] = useState<ResultatBien[]>([]);
  const [encours, setEncours] = useState<string[]>([]);
  const [voirCases, setVoirCases] = useState(false);
  const crm = useRef<EtatCRMBiens | null>(null);
  const stop = useRef(false);
  const [arret, setArret] = useState(false);

  const lire = async (f: File | undefined) => {
    if (!f) return;
    setErreur(''); setPhase('lecture');
    try {
      const biens = lireFichierBiens(await f.text());
      const etat = await lireCRMBiens();
      crm.current = etat;
      const plans = planifierBiens(biens, etat.clients, aujourdhuiYmd());
      const l = plans.map(p => ({ p, deja: dejaLa(p, etat.biens) }));
      setLignes(l);
      setChoix(Object.fromEntries(l.map(({ p, deja }) => [p.ref, {
        importer: deja?.pourquoi !== 'importe', etape: p.proposition.etape, archive: p.proposition.archive, creerVendeur: !!p.vendeur && !p.trouve,
      }])));
      setPhase('apercu');
    } catch (e) { setErreur((e as Error).message); setPhase('fichier'); }
  };

  const res = useMemo(() => resumePlans(lignes.map(y => y.p)), [lignes]);
  const choisis = lignes.filter(y => choix[y.p.ref]?.importer && y.deja?.pourquoi !== 'importe');
  const compte = (o: Onglet) => lignes.filter(y => filtreOnglet(y, o)).length;
  function filtreOnglet(y: Ligne, o: Onglet): boolean {
    const c = choix[y.p.ref];
    if (o === 'tous') return true;
    if (o === 'deja') return !!y.deja;
    if (o === 'sansVendeur') return c?.etape !== 'annonce_type' && !y.p.trouve;
    return c?.etape === o;
  }
  const q = cherche.trim().toLowerCase();
  const vues = lignes.filter(y => filtreOnglet(y, onglet) && (!q || `${y.p.ref} ${resumeBien(y.p)} ${nomVendeur(y.p)} ${y.p.donnees.adresse || ''}`.toLowerCase().includes(q)));
  const maj = (ref: string, y: Partial<ChoixBien>) => setChoix(c => ({ ...c, [ref]: { ...c[ref], ...y } }));
  const tout = (on: boolean) => setChoix(c => Object.fromEntries(Object.entries(c).map(([k, v]) => [k, vues.some(y => y.p.ref === k) && lignes.find(y => y.p.ref === k)?.deja?.pourquoi !== 'importe' ? { ...v, importer: on } : v])));

  const importer = async () => {
    if (!crm.current || !choisis.length) return;
    stop.current = false; setArret(false);
    setResultats([]); setPhase('import');
    const file = [...choisis];
    const faits: ResultatBien[] = [];
    const ouvriers = Array.from({ length: EN_PARALLELE }, async () => {
      while (file.length && !stop.current) {
        const y = file.shift()!;
        setEncours(e => [...e, y.p.ref]);
        let r: ResultatBien;
        try { r = await importerBien(y.p, choix[y.p.ref], crm.current!, y.deja?.pourquoi === 'meme' ? y.deja.bien : null); }
        catch (e) { r = { ref: y.p.ref, titre: y.p.titre, fait: null, id: null, reference: null, photos: 0, photosPrevues: y.p.photos.length, suivi: 0, vendeur: null, soucis: [], echec: (e as Error).message }; }
        faits.push(r);
        setResultats([...faits]);
        setEncours(e => e.filter(k => k !== y.p.ref));
      }
    });
    await Promise.all(ouvriers);
    setPhase('fini');
    onImporte();
  };

  if (typeof document === 'undefined') return null;
  let fen: ReactNode;

  if (phase === 'fichier' || phase === 'lecture') {
    fen = (
      <div className={d.fenetreIn} role="dialog" aria-modal="true" aria-label="Importer les biens d’ImmoFacile">
        <div className={d.fenTete}>
          <span className={x.icTete}><Ic n="maison" t={20} /></span>
          <div style={{ flex: '1 1 auto', minWidth: 0 }}>
            <h3>Importer les biens d’ImmoFacile</h3>
            <p>Le fichier des biens lus dans ImmoFacile : leur fiche, leurs pièces, leurs photos, leur vendeur et leur historique.</p>
          </div>
          <button type="button" className={x.x} aria-label="Fermer" disabled={phase === 'lecture'} onClick={onFermer}><Croix /></button>
        </div>
        <div className={x.corps}>
          <ul className={x.regles}>
            <li><Ic n="check" t={14} e={2.6} /><span>Rien n’est écrit avant ton clic sur « Importer » : tu vois d’abord chaque bien, et tu choisis.</span></li>
            <li><Ic n="check" t={14} e={2.6} /><span>Chaque bien est relié au vendeur déjà dans ton CRM (téléphone, puis e-mail, puis nom).</span></li>
            <li><Ic n="check" t={14} e={2.6} /><span>Un bien déjà importé n’est jamais recréé : tu peux relancer l’import sans risque.</span></li>
            <li><Ic n="check" t={14} e={2.6} /><span>Ce qui n’a pas de case dans le CRM est recopié dans les notes du bien : rien n’est perdu.</span></li>
          </ul>
          <label className={`${x.depot} ${phase === 'lecture' ? x.depotOccupe : ''}`}>
            <span className={x.depotIc}>{phase === 'lecture' ? <span className={x.roue} /> : <Ic n="telecharger" t={22} />}</span>
            <b>{phase === 'lecture' ? 'Lecture du fichier et de ton CRM…' : 'Choisir le fichier des biens'}</b>
            <small>biens-immofacile.json, dans tes Téléchargements</small>
            <input type="file" accept=".json,application/json" disabled={phase === 'lecture'} onChange={e => { void lire(e.target.files?.[0]); e.target.value = ''; }} />
          </label>
          {erreur && <div className={x.erreur}>{erreur}</div>}
        </div>
      </div>
    );
  } else if (phase === 'apercu') {
    const tous: { k: Onglet; l: string }[] = [
      { k: 'tous', l: 'Tous' },
      ...ETAPES_VENTE.map(e => ({ k: e.k as Onglet, l: e.pluriel })),
      { k: 'sansVendeur', l: 'Vendeur à voir' },
      { k: 'deja', l: 'Déjà dans le CRM' },
    ];
    const onglets = tous.filter(o => o.k === 'tous' || compte(o.k) > 0);
    const cases = Object.entries(res.sansCase).sort((a, b) => b[1] - a[1]);
    fen = (
      <div className={`${d.fenetreIn} ${x.large}`} role="dialog" aria-modal="true" aria-label="Aperçu de l’import des biens">
        <div className={d.fenTete}>
          <span className={x.icTete}><Ic n="maison" t={20} /></span>
          <div style={{ flex: '1 1 auto', minWidth: 0 }}>
            <h3>{`${pl(lignes.length, 'bien')} dans le fichier`}</h3>
            <p>Vérifie l’étape de chaque bien : ImmoFacile n’était pas toujours à jour. Décoche ceux que tu ne veux pas.</p>
          </div>
          <button type="button" className={x.x} aria-label="Fermer" onClick={onFermer}><Croix /></button>
        </div>
        <div className={x.tuiles}>
          <Tuile n={res.vendeurTrouve} l="vendeurs retrouvés dans le CRM" ton="vert" />
          <Tuile n={res.vendeurInconnu} l="vendeurs pas dans le CRM" ton={res.vendeurInconnu ? 'or' : 'gris'} />
          <Tuile n={res.vendeurAbsent} l="biens sans vendeur" ton="gris" />
          <Tuile n={res.photos} l="photos à copier" />
        </div>
        {cases.length > 0 && (
          <div className={x.cases}>
            <button type="button" onClick={() => setVoirCases(!voirCases)} aria-expanded={voirCases}>
              <Ic n="info" t={14} />
              <span>{`${pl(cases.reduce((s, c) => s + c[1], 0), 'réponse')} d’ImmoFacile sans choix équivalent dans le CRM : recopiées dans les notes du bien.`}</span>
              <Ic n={voirCases ? 'haut' : 'bas'} t={13} e={2.4} />
            </button>
            {voirCases && <div className={x.casesL}>{cases.map(([k, n]) => <span key={k}>{`${k} · ${n}`}</span>)}</div>}
          </div>
        )}
        <div className={x.barreOutils}>
          <div className={x.onglets} role="tablist" aria-label="Les biens par étape" data-defile="">
            {onglets.map(o => (
              <button key={o.k} type="button" aria-pressed={onglet === o.k} onClick={() => setOnglet(o.k)}>
                {o.k !== 'tous' && o.k !== 'deja' && o.k !== 'sansVendeur' && <span className={x.point} style={{ background: etapeDe(o.k).c }} />}
                {o.l}<i>{compte(o.k)}</i>
              </button>
            ))}
          </div>
          <div className={x.chercher}>
            <Ic n="loupe" t={14} />
            <input value={cherche} onChange={e => setCherche(e.target.value)} placeholder="N°, ville, vendeur…" aria-label="Chercher un bien" />
          </div>
        </div>
        <div className={x.tout}>
          <button type="button" onClick={() => tout(true)}>Tout cocher</button>
          <button type="button" onClick={() => tout(false)}>Tout décocher</button>
          <span>{vues.length !== lignes.length ? `${pl(vues.length, 'bien')} affichés` : ''}</span>
        </div>
        <div className={x.liste}>
          {vues.length === 0 && <div className={x.vide}>Aucun bien ici.</div>}
          {vues.map(l => <LigneBien key={l.p.ref} l={l} c={choix[l.p.ref]} onChoix={y => maj(l.p.ref, y)} />)}
        </div>
        <div className={x.pied}>
          <span className={x.piedTx}>{`${pl(choisis.length, 'bien')} à importer · ${pl(choisis.reduce((s, y) => s + y.p.photos.length, 0), 'photo')}`}</span>
          <div className={x.piedBtns}>
            <button type="button" className={d.btn} onClick={onFermer}>Annuler</button>
            <button type="button" className={`${d.btn} ${d.btnOr}`} disabled={!choisis.length} onClick={() => { void importer(); }}>
              <Ic n="telecharger" t={15} />{`Importer ${pl(choisis.length, 'bien')}`}
            </button>
          </div>
        </div>
      </div>
    );
  } else {
    const total = choisis.length;
    const faits = resultats.length;
    const crees = resultats.filter(r => r.fait === 'cree').length;
    const completes = resultats.filter(r => r.fait === 'complete').length;
    const echecs = resultats.filter(r => r.echec);
    const soucis = resultats.filter(r => !r.echec && r.soucis.length);
    const photos = resultats.reduce((s, r) => s + r.photos, 0);
    const vendCrees = resultats.filter(r => r.vendeur === 'cree').length;
    const fini = phase === 'fini';
    fen = (
      <div className={d.fenetreIn} role="dialog" aria-modal="true" aria-label={fini ? 'Import terminé' : 'Import en cours'}>
        <div className={x.fait}>
          <span className={`${x.faitIc} ${echecs.length ? x.faitIcRouge : !fini ? x.faitIcOr : ''}`}>{fini ? <Ic n={echecs.length ? 'info' : 'check'} t={30} e={2.4} /> : <span className={x.roue} />}</span>
          <h3>{fini ? (arret ? 'Import arrêté' : 'Import terminé') : 'Import en cours…'}</h3>
          <p>{fini ? `${pl(faits, 'bien')} traités sur ${fr(total)}.` : `${fr(faits)} sur ${fr(total)} · les photos sont copiées une à une, laisse cette fenêtre ouverte.`}</p>
          <div className={x.ecriture}><span className={x.barre}><i style={{ width: `${total ? Math.round((faits / total) * 100) : 0}%` }} /></span></div>
          {!fini && encours.length > 0 && <p className={x.encours}>{`En cours : n° ${encours.join(', n° ')}`}</p>}
          <div className={x.faitL}>
            <div><Ic n="plus" t={15} /><span>{`${pl(crees, 'fiche créée', 'fiches créées')}${completes ? ` · ${pl(completes, 'fiche complétée', 'fiches complétées')}` : ''}`}</span></div>
            <div><Ic n="photo" t={15} /><span>{`${pl(photos, 'photo copiée', 'photos copiées')}`}</span></div>
            {vendCrees > 0 && <div><Ic n="personne" t={15} /><span>{`${pl(vendCrees, 'contact vendeur créé', 'contacts vendeurs créés')}`}</span></div>}
          </div>
          {echecs.length > 0 && (
            <div className={`${x.soucis} ${x.rouge}`}>
              <b>{`${pl(echecs.length, 'bien')} pas importé${echecs.length > 1 ? 's' : ''} (relance l’import : ils seront repris, les autres non)`}</b>
              <ul>{echecs.map(r => <li key={r.ref}>{`n° ${r.ref} : ${r.echec}`}</li>)}</ul>
            </div>
          )}
          {soucis.length > 0 && (
            <div className={x.soucis}>
              <b>{`${pl(soucis.length, 'bien')} importé${soucis.length > 1 ? 's' : ''}, avec un manque`}</b>
              <ul>{soucis.map(r => <li key={r.ref}>{`n° ${r.ref}${r.reference ? ` (${r.reference})` : ''} : ${r.soucis.join(' ; ')}`}</li>)}</ul>
            </div>
          )}
          <div className={x.faitBtns}>
            {!fini && <button type="button" className={d.btn} disabled={arret} onClick={() => { stop.current = true; setArret(true); }}>{arret ? 'Arrêt après les biens en cours…' : 'Arrêter'}</button>}
            {fini && <button type="button" className={`${d.btn} ${d.btnNavy}`} onClick={onFermer}>Voir les biens</button>}
          </div>
        </div>
      </div>
    );
  }
  return createPortal(<div className={d.fenetre}>{fen}</div>, document.body);
}
