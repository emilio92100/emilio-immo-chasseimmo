'use client';
import { useEffect, useMemo, useRef, useState, type DragEvent } from 'react';
import { createPortal } from 'react-dom';
import { Ic } from '@/components/documents/ApercuActe';
import { supabase } from '@/lib/supabase';
import { CLES_MAIL, signatureDe } from '@/lib/mail-variables';
import { lignesDossier, lireDossier, lireFichiers, type Donnees, type EtatPiece, type FichierBien, type LigneDossier, type PieceDossier } from '@/lib/biens-vente';
import { Anneau } from './OngletsBien';
import { deposerPiece, envoyerDocuments, ouvrirPiece, retirerPiece, type DestDocuments } from './outils';
import x from './DossierBien.module.css';

/* ═══ Le dossier d'un bien, dans l'onglet Documents (V3.30) ═══════════════
   Alexandre : « le dossier diagnostic et pièces, c'est sur une seule ligne,
   très moche », et « avoir un parcours intuitif où je mets les documents,
   c'est enregistré, et je peux les envoyer au client ».

   · Déposer : on glisse (ou on choisit) un ou plusieurs fichiers. Le CRM
     devine ce que c'est d'après le nom (« DPE_Iena.pdf » → le DPE) ; on
     corrige si besoin, puis « Enregistrer » : chaque fichier part dans le
     stockage privé du bien (bucket « mandats », biens-vente/<id>/), la ligne
     passe « Reçu », datée du jour. Ce qui n'est pas une ligne du dossier va
     dans « Autres documents » (un DDT complet, un bail, un plan).
   · Le dossier : une tuile par pièce, rangées par groupe, en grille. Reçu,
     demandé, non concerné, le fichier, la date.
   · Envoyer : on coche les fichiers (ou « Envoyer des documents… »), une
     fenêtre récapitule à qui, l'objet, le message (déjà écrit, modifiable)
     et les pièces ; le mail part au nom d'Alexandre (/api/biens-vente,
     « envoyer »), et l'envoi est noté dans l'historique du bien et dans le
     Suivi du contact. */

const GROUPES: { k: LigneDossier['groupe'] | 'autres'; l: string; ic: string }[] = [
  { k: 'diag', l: 'Les diagnostics', ic: 'eclair' },
  { k: 'copro', l: 'La copropriété', ic: 'lots' },
  { k: 'vendeur', l: 'Du vendeur', ic: 'personne' },
  { k: 'autres', l: 'Autres documents', ic: 'dossier' },
];
const VIDE: PieceDossier = { etat: '', date: '', chemin: '', nom: '' };
const AUTRE = '__autre';
const aujourdhui = () => new Date().toISOString().slice(0, 10);
const idNeuf = () => `f${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
const sansAccent = (t: string) => t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
export const tailleFr = (o?: number) => (!o ? '' : o >= 1_000_000 ? `${String(Math.round(o / 100_000) / 10).replace('.', ',')} Mo` : `${Math.max(1, Math.round(o / 1000))} ko`);
const dateFr = (ymd: string) => {
  const d = new Date(`${ymd.slice(0, 10)}T12:00:00`);
  return isNaN(d.getTime()) ? '' : d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' });
};
const EXT_OK = /\.(pdf|jpe?g|png|heic|webp)$/i;
const MAX_JOINTS = 10_000_000;

/* Ce qu'est un fichier, d'après son nom. Rien de sûr : une proposition. */
const DEVINE: [RegExp, string][] = [
  [/\bddt\b|dossier.{0,4}diagnostic/, AUTRE],
  [/\bdpe\b|performance.{0,3}energ/, 'dpe'], [/amiante|\bdapp\b|\bdta\b/, 'amiante'], [/plomb|\bcrep\b/, 'plomb'],
  [/electri|\belec\b/, 'electricite'], [/\bgaz\b/, 'gaz'], [/termite/, 'termites'], [/\berp\b|\besris\b|etat.{0,5}risques|risques/, 'erp'],
  [/carrez|mesurage/, 'carrez'], [/assainissement|\bspanc\b/, 'assainissement'], [/merule/, 'merule'], [/bruit|aerodrome|\bpeb\b/, 'bruit'],
  [/audit/, 'audit'], [/reglement|etat.{0,4}descriptif|\bedd\b/, 'reglement'], [/\bpv\b|proces.{0,3}verbal|assemblee|\bag\b|\bago\b/, 'pvag'],
  [/fiche.{0,3}synth/, 'fiche'], [/carnet/, 'carnet'], [/pre.{0,2}etat/, 'preetat'], [/\bdtg\b|\bpppt\b|pluriannuel/, 'dtg'],
  [/titre|attestation.{0,5}propriete|acte.{0,5}(vente|achat|propriete)/, 'titre'], [/taxe|fonciere/, 'taxe'], [/facture/, 'factures'],
];
function deviner(nom: string, lignes: LigneDossier[]): string {
  const n = sansAccent(nom).replace(/[_.-]+/g, ' ');
  for (const [r, k] of DEVINE) if (r.test(n)) return k === AUTRE || lignes.some(l => l.k === k) ? k : AUTRE;
  return AUTRE;
}
const titreDeFichier = (nom: string) => nom.replace(/\.[a-z0-9]{2,4}$/i, '').replace(/[_]+/g, ' ').trim();

type ARanger = { id: string; f: File; cle: string; titre: string; etat: 'attente' | 'envoi' | 'ok' | 'ko'; erreur?: string };
export type PieceEnvoi = { cle: string; titre: string; chemin: string; nom: string; taille?: number };
export type DestPropose = DestDocuments & { cle: string; role: string };
type Maj = (cle: string, v: unknown) => void;

/* ══ LE DOSSIER ════════════════════════════════════════════════════════════ */
export function DossierBien({ bienId, d, maj, destinataires, lieu, onMessage }: {
  bienId: string; d: Donnees; maj: Maj;
  /* Les personnes à qui envoyer : le propriétaire, les acheteurs du bien. */
  destinataires: DestPropose[];
  /* « l'appartement du 68 avenue d'Iéna » : pour le message déjà écrit. */
  lieu: string;
  onMessage: (m: { t: string; ok: boolean }) => void;
}) {
  const lignes = lignesDossier(d);
  const doss = lireDossier(d.dossier);
  const fichiers = lireFichiers(d.fichiers);
  const [filtre, setFiltre] = useState<'tout' | 'reunir' | 'demande' | 'recu'>('tout');
  const [choix, setChoix] = useState<string[]>([]);
  const [fen, setFen] = useState(false);
  const [aRanger, setARanger] = useState<ARanger[]>([]);
  const [occupe, setOccupe] = useState('');
  const [erreur, setErreur] = useState('');
  const [survol, setSurvol] = useState(false);
  const champ = useRef<HTMLInputElement>(null);

  const poser = (k: string, patch: Partial<PieceDossier>) => maj('dossier', (avant: unknown) => {
    const o = lireDossier(avant);
    return { ...o, [k]: { ...(o[k] || VIDE), ...patch } };
  });

  /* Les chiffres : reçus + non concernés sur le total, comme l'anneau d'avant. */
  const recus = lignes.filter(l => doss[l.k]?.etat === 'recu').length;
  const demandes = lignes.filter(l => doss[l.k]?.etat === 'demande').length;
  const nc = lignes.filter(l => doss[l.k]?.etat === 'nc').length;
  const faits = recus + nc;
  const reunir = lignes.length - faits;
  const detail = [`${recus} reçu${recus > 1 ? 's' : ''}`, demandes ? `${demandes} demandé${demandes > 1 ? 's' : ''}` : '', nc ? `${nc} non concerné${nc > 1 ? 's' : ''}` : '', reunir - demandes > 0 ? `${reunir - demandes} à demander` : ''].filter(Boolean).join(' · ');

  /* Tout ce qui peut partir par mail : les lignes avec un fichier, et les autres documents. */
  const envoyables: PieceEnvoi[] = useMemo(() => [
    ...lignes.filter(l => doss[l.k]?.chemin).map(l => ({ cle: l.k, titre: l.l, chemin: doss[l.k].chemin, nom: doss[l.k].nom || l.l, taille: doss[l.k].taille })),
    ...fichiers.map(f => ({ cle: f.id, titre: f.titre || titreDeFichier(f.nom), chemin: f.chemin, nom: f.nom, taille: f.taille })),
  ], [lignes, doss, fichiers]);
  const choisis = envoyables.filter(p => choix.includes(p.chemin));
  const basculer = (chemin: string) => setChoix(c => (c.includes(chemin) ? c.filter(y => y !== chemin) : [...c, chemin]));
  useEffect(() => { setChoix(c => c.filter(ch => envoyables.some(p => p.chemin === ch))); }, [envoyables]);

  /* ── Déposer ── */
  function ajouter(liste: FileList | File[]) {
    setErreur('');
    const l = Array.from(liste);
    const refuses = l.filter(f => !EXT_OK.test(f.name) || f.size > 25_000_000);
    if (refuses.length) setErreur(`${refuses.map(f => f.name).join(', ')} : ${refuses.length > 1 ? 'refusés' : 'refusé'} (PDF, JPG ou PNG, 25 Mo au plus).`);
    const bons = l.filter(f => !refuses.includes(f));
    setARanger(a => [...a, ...bons.map(f => {
      const cle = deviner(f.name, lignes);
      return { id: idNeuf(), f, cle, titre: cle === AUTRE ? titreDeFichier(f.name) : '', etat: 'attente' as const };
    })]);
  }
  function surDepot(e: DragEvent) {
    e.preventDefault(); setSurvol(false);
    if (e.dataTransfer?.files?.length) ajouter(e.dataTransfer.files);
  }
  async function enregistrer() {
    const liste = aRanger.filter(a => a.etat === 'attente' || a.etat === 'ko');
    if (!liste.length) return;
    /* Deux fichiers pour la même ligne : le second remplacerait le premier. */
    const lignesVisees = liste.filter(a => a.cle !== AUTRE).map(a => a.cle);
    const doublon = lignesVisees.find((k, i) => lignesVisees.indexOf(k) !== i);
    if (doublon) { setErreur(`Deux fichiers pour « ${lignes.find(l => l.k === doublon)?.l} » : le second remplacerait le premier. Range l’un des deux dans « Autre document ».`); return; }
    setOccupe('depot'); setErreur('');
    let n = 0;
    for (const a of liste) {
      setARanger(l => l.map(y => (y.id === a.id ? { ...y, etat: 'envoi', erreur: undefined } : y)));
      try {
        if (a.cle === AUTRE) {
          const r = await deposerPiece(bienId, `autre${a.id}`, a.f);
          const f: FichierBien = { id: a.id, titre: a.titre.trim() || titreDeFichier(a.f.name), chemin: r.chemin, nom: r.nom, taille: a.f.size, le: aujourdhui() };
          maj('fichiers', (avant: unknown) => [...lireFichiers(avant), f]);
        } else {
          const ancien = doss[a.cle]?.chemin;
          const r = await deposerPiece(bienId, a.cle, a.f);
          poser(a.cle, { chemin: r.chemin, nom: r.nom, taille: a.f.size, etat: 'recu', date: doss[a.cle]?.date || aujourdhui() });
          if (ancien) retirerPiece(ancien).catch(() => { /* l'ancien reste au stockage, sans lien */ });
        }
        n++;
        setARanger(l => l.map(y => (y.id === a.id ? { ...y, etat: 'ok' } : y)));
      } catch (e) {
        setARanger(l => l.map(y => (y.id === a.id ? { ...y, etat: 'ko', erreur: (e as Error).message } : y)));
      }
    }
    setOccupe('');
    if (n) onMessage({ t: `${n} document${n > 1 ? 's' : ''} enregistré${n > 1 ? 's' : ''} dans le dossier du bien.`, ok: true });
    /* Ce qui est passé quitte la liste ; ce qui a échoué y reste, avec son message. */
    setTimeout(() => setARanger(l => l.filter(y => y.etat !== 'ok')), 900);
  }

  async function retirerLigne(k: string) {
    const p = doss[k];
    if (!p?.chemin || !confirm(`Retirer le fichier « ${p.nom} » ?`)) return;
    setOccupe(k); setErreur('');
    try { await retirerPiece(p.chemin); poser(k, { chemin: '', nom: '', taille: undefined }); } catch (e) { setErreur((e as Error).message); }
    setOccupe('');
  }
  async function retirerFichier(f: FichierBien) {
    if (!confirm(`Retirer « ${f.titre || f.nom} » du dossier ?`)) return;
    setOccupe(f.id); setErreur('');
    try { await retirerPiece(f.chemin); maj('fichiers', (avant: unknown) => lireFichiers(avant).filter(y => y.id !== f.id)); } catch (e) { setErreur((e as Error).message); }
    setOccupe('');
  }
  async function deposerSur(k: string, f: File) {
    setOccupe(k); setErreur('');
    try {
      const ancien = doss[k]?.chemin;
      const r = await deposerPiece(bienId, k, f);
      poser(k, { chemin: r.chemin, nom: r.nom, taille: f.size, etat: 'recu', date: doss[k]?.date || aujourdhui() });
      if (ancien) retirerPiece(ancien).catch(() => { /* rien */ });
    } catch (e) { setErreur((e as Error).message); }
    setOccupe('');
  }

  const visible = (k: string) => {
    const e = doss[k]?.etat || '';
    return filtre === 'tout' || (filtre === 'reunir' ? e !== 'recu' && e !== 'nc' : filtre === 'demande' ? e === 'demande' : e === 'recu');
  };
  const poids = choisis.reduce((t, p) => t + (p.taille || 0), 0);

  return (
    <section className={x.dossier} onDragOver={e => { e.preventDefault(); setSurvol(true); }} onDragLeave={e => { if (e.currentTarget === e.target) setSurvol(false); }} onDrop={surDepot}>
      <div className={x.tete}>
        <Anneau part={lignes.length ? faits / lignes.length : 0} taille={68} ep={8} c="#16a34a" fond="#eef1f6" texteC="#1a2332" texte={`${faits}/${lignes.length}`} label={`${faits} pièces du dossier réglées sur ${lignes.length}`} />
        <div className={x.teteTx}>
          <h3>Le dossier : diagnostics et pièces</h3>
          <span>{detail}{fichiers.length ? ` · ${fichiers.length} autre${fichiers.length > 1 ? 's' : ''} document${fichiers.length > 1 ? 's' : ''}` : ''}</span>
        </div>
        <div className={x.teteBtns}>
          <button type="button" className={x.btn} disabled={!envoyables.length} onClick={() => setFen(true)} title={envoyables.length ? undefined : 'Aucun fichier déposé pour l’instant'}>
            <Ic n="envoyer" t={15} />Envoyer des documents…
          </button>
          <button type="button" className={`${x.btn} ${x.btnOr}`} onClick={() => champ.current?.click()}><Ic n="plus" t={15} e={2.4} />Déposer des documents</button>
          <input ref={champ} type="file" multiple accept=".pdf,image/*" hidden onChange={e => { if (e.target.files?.length) ajouter(e.target.files); e.target.value = ''; }} />
        </div>
      </div>

      {/* La zone de dépôt, et ce qui attend d'être rangé. */}
      {aRanger.length === 0 ? (
        <button type="button" className={`${x.zone} ${survol ? x.zoneSurvol : ''}`} onClick={() => champ.current?.click()}>
          <span className={x.zoneIc}><Ic n="telecharger" t={22} /></span>
          <span className={x.zoneTx}>
            <b>{survol ? 'Lâchez les fichiers ici' : 'Glissez vos documents ici, ou cliquez pour les choisir'}</b>
            <small>Plusieurs à la fois : le CRM reconnaît le DPE, l’amiante, les PV d’AG… à leur nom. PDF, JPG ou PNG, 25 Mo au plus.</small>
          </span>
        </button>
      ) : (
        <div className={x.ranger}>
          <div className={x.rangerT}>
            <b>{`${aRanger.length} fichier${aRanger.length > 1 ? 's' : ''} à ranger`}</b>
            <span>Vérifie ce que c’est, puis enregistre : chacun va à sa place dans le dossier.</span>
          </div>
          {aRanger.map(a => (
            <div key={a.id} className={x.rangerL} data-etat={a.etat}>
              <span className={x.rangerIc}><Ic n={a.etat === 'ok' ? 'check' : 'doc'} t={17} e={a.etat === 'ok' ? 2.8 : 1.9} /></span>
              <div className={x.rangerNom}><b>{a.f.name}</b><small>{a.etat === 'envoi' ? 'Envoi…' : a.etat === 'ok' ? 'Enregistré' : a.erreur || tailleFr(a.f.size)}</small></div>
              <div className={x.rangerChoix}>
                <select value={a.cle} disabled={a.etat === 'envoi' || a.etat === 'ok'} aria-label={`Ce qu’est ${a.f.name}`}
                  onChange={e => { const v = e.target.value; setARanger(l => l.map(y => (y.id === a.id ? { ...y, cle: v, titre: v === AUTRE ? y.titre || titreDeFichier(y.f.name) : y.titre } : y))); }}>
                  {GROUPES.filter(g => g.k !== 'autres').map(g => {
                    const ls = lignes.filter(l => l.groupe === g.k);
                    return ls.length ? <optgroup key={g.k} label={g.l}>{ls.map(l => <option key={l.k} value={l.k}>{`${l.l}${doss[l.k]?.chemin ? ' (remplace le fichier)' : ''}`}</option>)}</optgroup> : null;
                  })}
                  <option value={AUTRE}>Autre document…</option>
                </select>
                {a.cle === AUTRE && (
                  <input value={a.titre} placeholder="Son nom (ex. : bail, plan, DDT)" disabled={a.etat === 'envoi' || a.etat === 'ok'}
                    onChange={e => { const v = e.target.value; setARanger(l => l.map(y => (y.id === a.id ? { ...y, titre: v } : y))); }} aria-label="Nom du document" />
                )}
              </div>
              <button type="button" className={x.icBtn} aria-label={`Ne pas garder ${a.f.name}`} disabled={a.etat === 'envoi'} onClick={() => setARanger(l => l.filter(y => y.id !== a.id))}><Ic n="croix" t={14} e={2.2} /></button>
            </div>
          ))}
          <div className={x.rangerPied}>
            <button type="button" className={x.lien} disabled={!!occupe} onClick={() => champ.current?.click()}><Ic n="plus" t={13} e={2.4} />Ajouter d’autres fichiers</button>
            <span style={{ flex: 1 }} />
            <button type="button" className={x.btn} disabled={!!occupe} onClick={() => { setARanger([]); setErreur(''); }}>Annuler</button>
            <button type="button" className={`${x.btn} ${x.btnMarine}`} disabled={!!occupe || !aRanger.some(a => a.etat === 'attente' || a.etat === 'ko')} onClick={enregistrer}>
              <Ic n="check" t={15} e={2.6} />{occupe === 'depot' ? 'Enregistrement…' : `Enregistrer ${aRanger.filter(a => a.etat !== 'ok').length > 1 ? `les ${aRanger.filter(a => a.etat !== 'ok').length} documents` : 'le document'}`}
            </button>
          </div>
        </div>
      )}
      {erreur && <div className={x.erreur}>{erreur}</div>}

      <div className={x.filtres} role="group" aria-label="Filtrer le dossier">
        {([['tout', 'Tout', lignes.length], ['reunir', 'À réunir', reunir], ['demande', 'Demandés', demandes], ['recu', 'Reçus', recus]] as const).map(([k, l, nb]) => (
          <button key={k} type="button" aria-pressed={filtre === k} onClick={() => setFiltre(k)}>{l}<i>{nb}</i></button>
        ))}
      </div>

      {GROUPES.map(g => {
        if (g.k === 'autres') {
          if (!fichiers.length || (filtre !== 'tout' && filtre !== 'recu')) return null;
          return (
            <div key={g.k} className={x.groupe}>
              <div className={x.groupeT}><span><Ic n={g.ic} t={14} /></span>{g.l}<i>{fichiers.length}</i></div>
              <div className={x.grille}>
                {fichiers.map(f => (
                  <div key={f.id} className={x.tuile} data-etat="recu" data-choisi={choix.includes(f.chemin) ? 'oui' : 'non'}>
                    <div className={x.tuileT}>
                      <button type="button" className={x.coche} aria-pressed={choix.includes(f.chemin)} aria-label={`Choisir ${f.titre || f.nom} pour l’envoyer`} onClick={() => basculer(f.chemin)}><Ic n="check" t={12} e={3.2} /></button>
                      <div className={x.tuileNom}><b>{f.titre || titreDeFichier(f.nom)}</b><small>{[f.le ? `Déposé le ${dateFr(f.le)}` : '', tailleFr(f.taille)].filter(Boolean).join(' · ')}</small></div>
                    </div>
                    <div className={x.fichier}>
                      <button type="button" className={x.fichierNom} onClick={() => ouvrirPiece(f.chemin, f.nom)}><Ic n="trombone" t={13} /><span>{f.nom}</span></button>
                      <button type="button" className={x.icBtn} aria-label="Retirer ce document" disabled={occupe === f.id} onClick={() => retirerFichier(f)}><Ic n="corbeille" t={14} /></button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          );
        }
        const ls = lignes.filter(l => l.groupe === g.k);
        const vus = ls.filter(l => visible(l.k));
        if (!ls.length || !vus.length) return null;
        const ok = ls.filter(l => doss[l.k]?.etat === 'recu' || doss[l.k]?.etat === 'nc').length;
        return (
          <div key={g.k} className={x.groupe}>
            <div className={x.groupeT}><span><Ic n={g.ic} t={14} /></span>{g.l}<i>{`${ok} sur ${ls.length}`}</i></div>
            <div className={x.grille}>
              {vus.map(l => {
                const p = doss[l.k] || VIDE;
                const etat: EtatPiece = p.etat;
                return (
                  <div key={l.k} className={x.tuile} data-etat={etat || 'vide'} data-choisi={p.chemin && choix.includes(p.chemin) ? 'oui' : 'non'}>
                    <div className={x.tuileT}>
                      {p.chemin
                        ? <button type="button" className={x.coche} aria-pressed={choix.includes(p.chemin)} aria-label={`Choisir ${l.l} pour l’envoyer`} onClick={() => basculer(p.chemin)}><Ic n="check" t={12} e={3.2} /></button>
                        : <span className={x.pastille} data-etat={etat || 'vide'} aria-hidden="true">{etat === 'nc' ? '–' : etat === 'demande' ? '!' : ''}</span>}
                      <div className={x.tuileNom}><b>{l.l}</b>{l.aide && <small>{l.aide}</small>}</div>
                    </div>
                    <div className={x.etats} role="group" aria-label={l.l}>
                      <button type="button" data-k="recu" aria-pressed={etat === 'recu'} onClick={() => poser(l.k, { etat: etat === 'recu' ? '' : 'recu', date: p.date || aujourdhui() })}>Reçu</button>
                      <button type="button" data-k="demande" aria-pressed={etat === 'demande'} onClick={() => poser(l.k, { etat: etat === 'demande' ? '' : 'demande' })}>Demandé</button>
                      <button type="button" data-k="nc" aria-pressed={etat === 'nc'} onClick={() => poser(l.k, { etat: etat === 'nc' ? '' : 'nc' })}>Non concerné</button>
                    </div>
                    {etat !== 'nc' && (
                      <div className={x.fichier}>
                        {p.chemin ? (
                          <>
                            <button type="button" className={x.fichierNom} onClick={() => ouvrirPiece(p.chemin, p.nom)} title={p.nom}><Ic n="trombone" t={13} /><span>{p.nom || 'Le fichier'}</span></button>
                            <button type="button" className={x.icBtn} aria-label="Retirer le fichier" disabled={occupe === l.k} onClick={() => retirerLigne(l.k)}><Ic n="corbeille" t={14} /></button>
                          </>
                        ) : (
                          <label className={x.deposer}>
                            <Ic n="telecharger" t={13} />{occupe === l.k ? 'Envoi…' : 'Déposer le fichier'}
                            <input type="file" accept=".pdf,image/*" disabled={occupe === l.k} onChange={e => { const f = e.target.files?.[0]; if (f) deposerSur(l.k, f); e.target.value = ''; }} />
                          </label>
                        )}
                        {etat === 'recu' && (
                          <label className={x.date}>
                            <span>Reçu le</span>
                            <input type="date" value={p.date} onChange={e => poser(l.k, { date: e.target.value })} />
                          </label>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
      <div className={x.pied}>Les fichiers sont privés : visibles par toi seul, jamais dans un espace client. Ils ne partent que si tu les envoies.</div>

      {/* La barre du choix : elle suit en bas de l'écran. */}
      {choisis.length > 0 && (
        <div className={x.barre} role="region" aria-label="Documents choisis">
          <span className={x.barreN}><b>{choisis.length}</b>{`document${choisis.length > 1 ? 's' : ''} choisi${choisis.length > 1 ? 's' : ''}`}{poids ? <small>{tailleFr(poids)}</small> : null}</span>
          <button type="button" className={x.lienClair} onClick={() => setChoix([])}>Tout décocher</button>
          <button type="button" className={`${x.btn} ${x.btnOr}`} onClick={() => setFen(true)}><Ic n="envoyer" t={15} />Envoyer par mail…</button>
        </div>
      )}

      {fen && (
        <FenEnvoiDocuments bienId={bienId} pieces={envoyables} depart={choix} destinataires={destinataires} lieu={lieu}
          onFermer={() => setFen(false)}
          onFait={m => { setFen(false); setChoix([]); onMessage(m); }} />
      )}
    </section>
  );
}

/* ══ LA FENÊTRE D'ENVOI ════════════════════════════════════════════════════ */
function messageType(prenom: string, lieu: string, titres: string[], signature: string) {
  const liste = titres.map(t => `– ${t}`).join('\n');
  const un = titres.length === 1;
  return `Bonjour${prenom ? ` ${prenom}` : ''},\n\n${un ? 'Voici le document' : 'Voici les documents'} concernant ${lieu || 'le bien'} :\n${liste}\n\nN’hésitez pas à revenir vers moi si vous avez la moindre question.\n\n${signature}`;
}

export function FenEnvoiDocuments({ bienId, pieces, depart, destinataires, lieu, onFermer, onFait }: {
  bienId: string; pieces: PieceEnvoi[]; depart: string[]; destinataires: DestPropose[]; lieu: string;
  onFermer: () => void; onFait: (m: { t: string; ok: boolean }) => void;
}) {
  const [choix, setChoix] = useState<string[]>(() => (depart.length ? depart : pieces.map(p => p.chemin)));
  const [dests, setDests] = useState<string[]>(() => (destinataires[0] ? [destinataires[0].cle] : []));
  const [autre, setAutre] = useState('');
  const [objet, setObjet] = useState(() => `Documents · ${lieu ? lieu.charAt(0).toUpperCase() + lieu.slice(1) : 'votre bien'}`);
  const [signature, setSignature] = useState(() => signatureDe({}));
  const [texte, setTexte] = useState<string | null>(null);
  const [en, setEn] = useState(false);
  const [erreur, setErreur] = useState('');

  useEffect(() => {
    let vivant = true;
    supabase.from('parametres').select('cle, valeur').in('cle', CLES_MAIL).then(({ data }) => {
      if (vivant && data) setSignature(signatureDe(Object.fromEntries(data.map((r: { cle: string; valeur: string | null }) => [r.cle, r.valeur || '']))));
    });
    return () => { vivant = false; };
  }, []);

  const choisies = pieces.filter(p => choix.includes(p.chemin));
  const lesDests = destinataires.filter(d => dests.includes(d.cle));
  const autreOk = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(autre.trim());
  const tous: DestDocuments[] = [...lesDests.map(d => ({ email: d.email, nom: d.nom, clientId: d.clientId, rechercheId: d.rechercheId })), ...(autreOk ? [{ email: autre.trim().toLowerCase(), nom: '' }] : [])];
  /* Le prénom de l'accueil : celui du destinataire s'il n'y en a qu'un. */
  const prenom = tous.length === 1 && lesDests.length === 1 ? (lesDests[0].nom.split(' ')[0] || '') : '';
  /* Le message se réécrit tant qu'on n'y a pas touché. */
  const message = texte ?? messageType(prenom, lieu, choisies.map(p => p.titre), signature);
  const connu = choisies.every(p => p.taille);
  const poids = choisies.reduce((t, p) => t + (p.taille || 0), 0);
  const liens = connu && poids > MAX_JOINTS;

  async function envoyer() {
    if (!choisies.length) { setErreur('Choisis au moins un document.'); return; }
    if (!tous.length) { setErreur(autre.trim() ? 'Cette adresse e-mail ne semble pas complète.' : 'Choisis à qui l’envoyer.'); return; }
    setEn(true); setErreur('');
    try {
      const r = await envoyerDocuments({ bienId, destinataires: tous, sujet: objet.trim(), message: message.trim(), pieces: choisies.map(p => ({ chemin: p.chemin, nom: p.nom })) });
      const a = r.envoyes.length > 1 ? `${r.envoyes.length} destinataires` : r.envoyes[0];
      onFait({ t: `${choisies.length > 1 ? `${choisies.length} documents envoyés` : 'Document envoyé'} à ${a}${r.mode === 'liens' ? ', en liens de téléchargement (trop lourds pour des pièces jointes)' : ''}.${r.avertissements.length ? ` ${r.avertissements.join(' · ')}` : ''}`, ok: true });
    } catch (e) {
      setErreur((e as Error).message);
      setEn(false);
    }
  }

  const fen = (
    <div className={x.voile} onMouseDown={e => { if (e.target === e.currentTarget && !en) onFermer(); }}>
      <div className={x.fen} role="dialog" aria-modal="true" aria-label="Envoyer des documents">
        <div className={x.fenTete}>
          <span className={x.fenIc}><Ic n="envoyer" t={20} /></span>
          <div className={x.fenTx}>
            <h2>Envoyer des documents</h2>
            <p>Relis avant d’envoyer : le mail part à ton nom, avec les documents choisis.</p>
          </div>
          <button type="button" className={x.fermer} aria-label="Fermer" disabled={en} onClick={onFermer}><Ic n="croix" t={16} e={2.2} /></button>
        </div>
        <div className={x.fenCorps}>
          <div className={x.bloc}>
            <div className={x.blocT}>À qui</div>
            {destinataires.length > 0 && (
              <div className={x.dests}>
                {destinataires.map(d => {
                  const on = dests.includes(d.cle);
                  return (
                    <button key={d.cle} type="button" className={x.dest} aria-pressed={on} onClick={() => { setDests(l => (on ? l.filter(y => y !== d.cle) : [...l, d.cle])); }}>
                      <span className={x.destCoche}><Ic n="check" t={11} e={3.2} /></span>
                      <span className={x.destTx}><b>{d.nom || d.email}</b><small>{`${d.role} · ${d.email}`}</small></span>
                    </button>
                  );
                })}
              </div>
            )}
            <label className={x.champ}>
              <span>{destinataires.length ? 'Ou une autre adresse' : 'Adresse e-mail'}</span>
              <input type="email" value={autre} placeholder="notaire@etude.fr" onChange={e => setAutre(e.target.value)} />
            </label>
            {!destinataires.length && <small className={x.aide}>Aucune adresse sur la fiche du propriétaire ni des acheteurs du bien : tape-la ici.</small>}
          </div>

          <div className={x.bloc}>
            <div className={x.blocT}>{`Les documents · ${choisies.length} sur ${pieces.length}`}</div>
            <div className={x.pieces}>
              {pieces.map(p => {
                const on = choix.includes(p.chemin);
                return (
                  <button key={p.chemin} type="button" className={x.piece} aria-pressed={on} onClick={() => setChoix(l => (on ? l.filter(y => y !== p.chemin) : [...l, p.chemin]))}>
                    <span className={x.destCoche}><Ic n="check" t={11} e={3.2} /></span>
                    <span className={x.pieceTx}><b>{p.titre}</b><small>{[p.nom !== p.titre ? p.nom : '', tailleFr(p.taille)].filter(Boolean).join(' · ')}</small></span>
                  </button>
                );
              })}
            </div>
            <div className={x.poids} data-liens={liens ? 'oui' : 'non'}>
              <Ic n={liens ? 'info' : 'trombone'} t={14} />
              <span>{!choisies.length ? 'Aucun document choisi.'
                : liens ? `${tailleFr(poids)} : trop lourd pour des pièces jointes. Le mail contiendra des liens de téléchargement, valables 7 jours.`
                  : connu ? `En pièces jointes · ${tailleFr(poids)} en tout.`
                    : 'En pièces jointes (au-delà de 10 Mo, ils partiraient en liens de téléchargement, valables 7 jours).'}</span>
            </div>
          </div>

          <div className={x.bloc}>
            <label className={x.champ}><span>Objet</span><input value={objet} onChange={e => setObjet(e.target.value)} /></label>
            <label className={x.champ}>
              <span>Message{texte !== null && <button type="button" className={x.lien} onClick={() => setTexte(null)}>Revenir au message proposé</button>}</span>
              <textarea rows={11} value={message} onChange={e => setTexte(e.target.value)} />
            </label>
          </div>
          {erreur && <div className={x.erreur}>{erreur}</div>}
        </div>
        <div className={x.fenPied}>
          <button type="button" className={x.btn} disabled={en} onClick={onFermer}>Annuler</button>
          <button type="button" className={`${x.btn} ${x.btnOr}`} disabled={en || !choisies.length || !tous.length} onClick={envoyer}>
            <Ic n="envoyer" t={15} />{en ? 'Envoi…' : tous.length === 1 ? `Envoyer à ${lesDests[0]?.nom.split(' ')[0] || tous[0].email}` : tous.length > 1 ? `Envoyer à ${tous.length} personnes` : 'Envoyer'}
          </button>
        </div>
      </div>
    </div>
  );
  return typeof document === 'undefined' ? null : createPortal(fen, document.body);
}
