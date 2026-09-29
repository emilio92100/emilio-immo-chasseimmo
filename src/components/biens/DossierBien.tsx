'use client';
import { useEffect, useRef, useState, type DragEvent, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Ic } from '@/components/documents/ApercuActe';
import { supabase } from '@/lib/supabase';
import { CLES_MAIL, signatureDe } from '@/lib/mail-variables';
import {
  estPerso, lignesDossier, lireDossier, lireFichiers, lirePiecesPerso,
  type Donnees, type EtatPiece, type FichierBien, type LigneDossier, type PieceDossier,
} from '@/lib/biens-vente';
import { Anneau } from './OngletsBien';
import { deposerPiece, envoyerDocuments, ouvrirPiece, retirerPiece, type DestDocuments } from './outils';
import x from './DossierBien.module.css';

/* ═══ Le dossier d'un bien, dans l'onglet Documents (V3.30, V3.31) ═════════
   Alexandre : « le dossier diagnostic et pièces, c'est sur une seule ligne,
   très moche », et « avoir un parcours intuitif où je mets les documents,
   c'est enregistré, et je peux les envoyer au client ».

   · Déposer : on glisse (ou on choisit) un ou plusieurs fichiers. Le CRM
     devine ce que c'est d'après le nom (« DPE_Iena.pdf » → le DPE) ; on
     corrige si besoin, puis « Enregistrer » : chaque fichier part dans le
     stockage privé du bien (bucket « mandats », biens-vente/<id>/), la ligne
     passe « Reçu », datée du jour. Ce qui n'est pas une ligne du dossier va
     dans « Autres documents », sous le nom qu'on lui donne.
   · Un dossier de diagnostics en UN seul fichier (V3.31) : « Dossier de
     diagnostics complet » ; on coche ce qu'il contient (DPE, amiante,
     plomb…). Le fichier n'est gardé qu'une fois (`donnees.fichiers`, sorte
     'ddt') ; chaque diagnostic couvert passe « Reçu » et pointe vers lui
     (`dossier[k].dans`). Il s'affiche en tête des diagnostics, avec ce qu'il
     couvre ; « Ce qu'il contient » se corrige à tout moment.
   · Ses propres pièces (V3.31) : « + Ajouter une pièce » dans chaque groupe,
     avec le nom qu'on veut (Kbis de la SCI, statuts, bail…) —
     `donnees.piecesPerso`. Elles se renomment et se retirent ; les autres
     documents se renomment aussi.
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
/* Des idées de pièces à ajouter, par groupe : un clic les pose. */
const IDEES: Record<LigneDossier['groupe'], string[]> = {
  diag: ['Diagnostic radon', 'Attestation de surface (loi Boutin)', 'Rapport de repérage avant travaux'],
  copro: ['Relevés de charges (4 derniers trimestres)', 'Convocation à la prochaine AG', 'État daté', 'Attestation du syndic'],
  vendeur: ['Pièce d’identité', 'Bail en cours', 'Attestation d’assurance habitation', 'Contrat de gestion locative'],
};
const IDEES_SCI = ['Kbis de la SCI', 'Statuts de la SCI', 'PV d’AG de la SCI autorisant la vente'];
const VIDE: PieceDossier = { etat: '', date: '', chemin: '', nom: '' };
const AUTRE = '__autre';
const DDT = '__ddt';
const TITRE_DDT = 'Dossier de diagnostic technique';
const aujourdhui = () => new Date().toISOString().slice(0, 10);
const idNeuf = () => `f${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
const sansAccent = (t: string) => t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
export const tailleFr = (o?: number) => (!o ? '' : o >= 1_000_000 ? `${String(Math.round(o / 100_000) / 10).replace('.', ',')} Mo` : `${Math.max(1, Math.round(o / 1000))} ko`);
const dateFr = (ymd: string) => {
  const d = new Date(`${ymd.slice(0, 10)}T12:00:00`);
  return isNaN(d.getTime()) ? '' : d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' });
};
const EXT_OK = /\.(pdf|jpe?g|png|heic|webp)$/i;
const CLE_REPLIS = 'emilio.dossier.replis';
const MAX_JOINTS = 10_000_000;
/* « DPE, amiante, plomb » : la liste courte de ce que couvre un DDT. */
const enMinuscule = (t: string) => (/^[A-Z]{2,}/.test(t) ? t : t.charAt(0).toLowerCase() + t.slice(1));

/* Ce qu'est un fichier, d'après son nom. Rien de sûr : une proposition. */
const DEVINE: [RegExp, string][] = [
  [/\bddt\b|dossier.{0,6}diagnostic|diagnostics?\s+(techniques?|immobiliers?)|\bdiags\b|rapport.{0,6}diagnostics/, DDT],
  [/\bdpe\b|performance.{0,3}energ/, 'dpe'], [/amiante|\bdapp\b|\bdta\b/, 'amiante'], [/plomb|\bcrep\b/, 'plomb'],
  [/electri|\belec\b/, 'electricite'], [/\bgaz\b/, 'gaz'], [/termite/, 'termites'], [/\berp\b|\besris\b|etat.{0,5}risques|risques/, 'erp'],
  [/carrez|mesurage/, 'carrez'], [/assainissement|\bspanc\b/, 'assainissement'], [/merule/, 'merule'], [/bruit|aerodrome|\bpeb\b/, 'bruit'],
  [/audit/, 'audit'], [/reglement|etat.{0,4}descriptif|\bedd\b/, 'reglement'], [/\bpv\b|proces.{0,3}verbal|assemblee|\bag\b|\bago\b/, 'pvag'],
  [/fiche.{0,3}synth/, 'fiche'], [/carnet/, 'carnet'], [/pre.{0,2}etat/, 'preetat'], [/\bdtg\b|\bpppt\b|pluriannuel/, 'dtg'],
  [/titre|attestation.{0,5}propriete|acte.{0,5}(vente|achat|propriete)/, 'titre'], [/taxe|fonciere/, 'taxe'], [/facture/, 'factures'],
];
function deviner(nom: string, lignes: LigneDossier[]): string {
  const n = sansAccent(nom).replace(/[_.-]+/g, ' ');
  /* Une pièce ajoutée à la main, dont le nom est dans celui du fichier. */
  const perso = lignes.find(l => estPerso(l.k) && sansAccent(l.l).length > 3 && n.includes(sansAccent(l.l)));
  if (perso) return perso.k;
  for (const [r, k] of DEVINE) if (r.test(n)) return k === AUTRE || k === DDT || lignes.some(l => l.k === k) ? k : AUTRE;
  return AUTRE;
}
const titreDeFichier = (nom: string) => nom.replace(/\.[a-z0-9]{2,4}$/i, '').replace(/[_]+/g, ' ').trim();

type ARanger = { id: string; f: File; cle: string; titre: string; contient: string[]; etat: 'attente' | 'envoi' | 'ok' | 'ko'; erreur?: string };
export type PieceEnvoi = { cle: string; titre: string; chemin: string; nom: string; taille?: number };
export type DestPropose = DestDocuments & { cle: string; role: string };
type Maj = (cle: string, v: unknown) => void;

/* Des pastilles à cocher : ce que contient un dossier de diagnostics. */
function Contenu({ lignes, on, onBasculer, desactive }: { lignes: LigneDossier[]; on: string[]; onBasculer: (k: string) => void; desactive?: boolean }) {
  return (
    <div className={x.contenu} role="group" aria-label="Ce que contient le fichier">
      {lignes.map(l => (
        <button key={l.k} type="button" className={x.puce} aria-pressed={on.includes(l.k)} disabled={desactive} onClick={() => onBasculer(l.k)}>
          <span className={x.puceCoche}><Ic n="check" t={10} e={3.4} /></span>{l.l}
        </button>
      ))}
    </div>
  );
}

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
  const ddts = fichiers.filter(f => f.sorte === 'ddt');
  const autres = fichiers.filter(f => f.sorte !== 'ddt');
  const diags = lignes.filter(l => l.groupe === 'diag');
  const [filtre, setFiltre] = useState<'tout' | 'reunir' | 'demande' | 'recu'>('tout');
  const [choix, setChoix] = useState<string[]>([]);
  const [fen, setFen] = useState(false);
  const [aRanger, setARanger] = useState<ARanger[]>([]);
  const [occupe, setOccupe] = useState('');
  const [erreur, setErreur] = useState('');
  const [survol, setSurvol] = useState(false);
  /* Un nom en cours de modification (une pièce ajoutée, un autre document). */
  const [nom, setNom] = useState<{ k: string; v: string } | null>(null);
  /* Le groupe où l'on ajoute une pièce, et son nom. */
  const [ajout, setAjout] = useState<{ g: LigneDossier['groupe']; v: string } | null>(null);
  /* Le DDT dont on corrige le contenu. */
  const [contenuDe, setContenuDe] = useState('');
  /* Les groupes repliés (V3.31) : le choix est gardé dans ce navigateur ;
     sans choix, un groupe complet (tout reçu ou non concerné) se replie seul. */
  const [replis, setReplis] = useState<Record<string, boolean>>(() => {
    try { const v = JSON.parse(localStorage.getItem(CLE_REPLIS) || '{}'); return v && typeof v === 'object' ? v : {}; } catch { return {}; }
  });
  const champ = useRef<HTMLInputElement>(null);

  const poser = (k: string, patch: Partial<PieceDossier>) => maj('dossier', (avant: unknown) => {
    const o = lireDossier(avant);
    return { ...o, [k]: { ...(o[k] || VIDE), ...patch } };
  });
  const ddtDe = (k: string) => (doss[k]?.dans ? ddts.find(f => f.id === doss[k].dans) : undefined);
  const couverts = (id: string) => lignes.filter(l => doss[l.k]?.dans === id);

  /* Les chiffres : reçus + non concernés sur le total, comme l'anneau d'avant. */
  const recus = lignes.filter(l => doss[l.k]?.etat === 'recu').length;
  const demandes = lignes.filter(l => doss[l.k]?.etat === 'demande').length;
  const nc = lignes.filter(l => doss[l.k]?.etat === 'nc').length;
  const faits = recus + nc;
  const reunir = lignes.length - faits;
  const detail = [`${recus} reçu${recus > 1 ? 's' : ''}`, demandes ? `${demandes} demandé${demandes > 1 ? 's' : ''}` : '', nc ? `${nc} non concerné${nc > 1 ? 's' : ''}` : '', reunir - demandes > 0 ? `${reunir - demandes} à demander` : ''].filter(Boolean).join(' · ');

  /* Tout ce qui peut partir par mail : les lignes qui ont leur fichier, les
     dossiers de diagnostics (avec ce qu'ils couvrent), les autres documents. */
  const envoyables: PieceEnvoi[] = [
    ...ddts.map(f => {
      const c = lignes.filter(l => doss[l.k]?.dans === f.id).map(l => enMinuscule(l.l));
      return { cle: f.id, titre: `${f.titre || TITRE_DDT}${c.length ? ` (${c.join(', ')})` : ''}`, chemin: f.chemin, nom: f.nom, taille: f.taille };
    }),
    ...lignes.filter(l => doss[l.k]?.chemin).map(l => ({ cle: l.k, titre: l.l, chemin: doss[l.k].chemin, nom: doss[l.k].nom || l.l, taille: doss[l.k].taille })),
    ...autres.map(f => ({ cle: f.id, titre: f.titre || titreDeFichier(f.nom), chemin: f.chemin, nom: f.nom, taille: f.taille })),
  ];
  const choisis = envoyables.filter(p => choix.includes(p.chemin));
  const basculer = (chemin: string) => setChoix(c => (c.includes(chemin) ? c.filter(y => y !== chemin) : [...c, chemin]));

  /* ── Déposer ── */
  /* Ce qu'un DDT couvre d'office : les diagnostics sans fichier et pas « non concerné ». */
  const contenuParDefaut = () => {
    const l = diags.filter(y => doss[y.k]?.etat !== 'nc' && !doss[y.k]?.chemin && !doss[y.k]?.dans).map(y => y.k);
    return l.length ? l : diags.filter(y => doss[y.k]?.etat !== 'nc').map(y => y.k);
  };
  function ajouter(liste: FileList | File[]) {
    setErreur('');
    const l = Array.from(liste);
    const refuses = l.filter(f => !EXT_OK.test(f.name) || f.size > 25_000_000);
    if (refuses.length) setErreur(`${refuses.map(f => f.name).join(', ')} : ${refuses.length > 1 ? 'refusés' : 'refusé'} (PDF, JPG ou PNG, 25 Mo au plus).`);
    const bons = l.filter(f => !refuses.includes(f));
    setARanger(a => [...a, ...bons.map(f => {
      const cle = deviner(f.name, lignes);
      return { id: idNeuf(), f, cle, titre: cle === AUTRE ? titreDeFichier(f.name) : cle === DDT ? TITRE_DDT : '', contient: cle === DDT ? contenuParDefaut() : [], etat: 'attente' as const };
    })]);
  }
  const majRanger = (id: string, patch: Partial<ARanger>) => setARanger(l => l.map(y => (y.id === id ? { ...y, ...patch } : y)));
  function choisirSorte(a: ARanger, v: string) {
    majRanger(a.id, {
      cle: v,
      titre: v === AUTRE ? (a.cle === DDT ? '' : a.titre) || titreDeFichier(a.f.name) : v === DDT ? TITRE_DDT : a.titre,
      contient: v === DDT ? (a.contient.length ? a.contient : contenuParDefaut()) : a.contient,
    });
  }
  function surDepot(e: DragEvent) {
    e.preventDefault(); setSurvol(false);
    if (e.dataTransfer?.files?.length) ajouter(e.dataTransfer.files);
  }
  async function enregistrer() {
    const liste = aRanger.filter(a => a.etat === 'attente' || a.etat === 'ko');
    if (!liste.length) return;
    /* Deux fichiers pour la même ligne : le second remplacerait le premier. */
    const lignesVisees = liste.filter(a => a.cle !== AUTRE && a.cle !== DDT).map(a => a.cle);
    const doublon = lignesVisees.find((k, i) => lignesVisees.indexOf(k) !== i);
    if (doublon) { setErreur(`Deux fichiers pour « ${lignes.find(l => l.k === doublon)?.l} » : le second remplacerait le premier. Range l’un des deux dans « Autre document ».`); return; }
    if (liste.some(a => a.cle === DDT && !a.contient.length)) { setErreur('Coche ce que contient le dossier de diagnostics (DPE, amiante…), ou range-le dans « Autre document ».'); return; }
    setOccupe('depot'); setErreur('');
    let n = 0;
    for (const a of liste) {
      majRanger(a.id, { etat: 'envoi', erreur: undefined });
      try {
        if (a.cle === AUTRE || a.cle === DDT) {
          const r = await deposerPiece(bienId, `${a.cle === DDT ? 'ddt' : 'autre'}${a.id}`, a.f);
          const f: FichierBien = {
            id: a.id, titre: a.titre.trim() || (a.cle === DDT ? TITRE_DDT : titreDeFichier(a.f.name)), chemin: r.chemin, nom: r.nom, taille: a.f.size, le: aujourdhui(),
            ...(a.cle === DDT ? { sorte: 'ddt' as const } : {}),
          };
          maj('fichiers', (avant: unknown) => [...lireFichiers(avant), f]);
          /* Chaque diagnostic couvert passe « Reçu » et pointe vers ce fichier. */
          if (a.cle === DDT) for (const k of a.contient) poser(k, { dans: a.id, etat: 'recu', date: doss[k]?.date || aujourdhui() });
        } else {
          const ancien = doss[a.cle]?.chemin;
          const r = await deposerPiece(bienId, a.cle, a.f);
          poser(a.cle, { chemin: r.chemin, nom: r.nom, taille: a.f.size, etat: 'recu', date: doss[a.cle]?.date || aujourdhui() });
          if (ancien) retirerPiece(ancien).catch(() => { /* l'ancien reste au stockage, sans lien */ });
        }
        n++;
        majRanger(a.id, { etat: 'ok' });
      } catch (e) {
        majRanger(a.id, { etat: 'ko', erreur: (e as Error).message });
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
    const c = f.sorte === 'ddt' ? couverts(f.id) : [];
    const suite = c.length ? `\n\nLes ${c.length} diagnostics qu’il couvre repasseront « à voir », sauf ceux qui ont leur propre fichier.` : '';
    if (!confirm(`Retirer « ${f.titre || f.nom} » du dossier ?${suite}`)) return;
    setOccupe(f.id); setErreur('');
    try {
      await retirerPiece(f.chemin);
      maj('fichiers', (avant: unknown) => lireFichiers(avant).filter(y => y.id !== f.id));
      for (const l of c) poser(l.k, doss[l.k]?.chemin ? { dans: '' } : { dans: '', etat: '' });
    } catch (e) { setErreur((e as Error).message); }
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
  /* Ce que couvre un DDT : un clic ajoute ou retire un diagnostic. */
  function basculerContenu(f: FichierBien, k: string) {
    const p = doss[k] || VIDE;
    if (p.dans === f.id) poser(k, p.chemin ? { dans: '' } : { dans: '', etat: p.etat === 'recu' ? '' : p.etat });
    else poser(k, { dans: f.id, etat: 'recu', date: p.date || aujourdhui() });
  }

  /* ── Ses propres pièces, et les noms ── */
  function ajouterPiece() {
    const l = ajout?.v.trim();
    if (!ajout || !l) return;
    if (lignes.some(y => sansAccent(y.l) === sansAccent(l))) { setErreur(`« ${l} » est déjà dans le dossier.`); return; }
    const k = `perso${idNeuf().slice(1)}`;
    maj('piecesPerso', (avant: unknown) => [...lirePiecesPerso(avant), { k, l, groupe: ajout.g }]);
    setAjout(null); setErreur('');
  }
  async function retirerPerso(k: string, l: string) {
    const p = doss[k];
    if (!confirm(`Retirer « ${l} » du dossier ?${p?.chemin ? '\n\nSon fichier sera supprimé.' : ''}`)) return;
    setOccupe(k); setErreur('');
    try {
      if (p?.chemin) await retirerPiece(p.chemin);
      maj('piecesPerso', (avant: unknown) => lirePiecesPerso(avant).filter(y => y.k !== k));
      maj('dossier', (avant: unknown) => { const o = { ...lireDossier(avant) }; delete o[k]; return o; });
    } catch (e) { setErreur((e as Error).message); }
    setOccupe('');
  }
  function enregistrerNom() {
    if (!nom) return;
    const v = nom.v.trim();
    if (!v) { setNom(null); return; }
    if (estPerso(nom.k)) maj('piecesPerso', (avant: unknown) => lirePiecesPerso(avant).map(y => (y.k === nom.k ? { ...y, l: v } : y)));
    else maj('fichiers', (avant: unknown) => lireFichiers(avant).map(y => (y.id === nom.k ? { ...y, titre: v } : y)));
    setNom(null);
  }
  /* Le nom d'une pièce ajoutée ou d'un document, et son champ pour le
     changer. Une fonction appelée, pas un composant : défini ici comme
     composant, il se remonterait à chaque lettre et le champ perdrait le
     curseur (AGENTS.md §2.4). */
  const nomDe = (k: string, l: string, sous?: ReactNode) => (nom?.k === k ? (
    <div className={x.tuileNom}>
      <input className={x.nomEdit} value={nom.v} autoFocus aria-label="Nouveau nom" onChange={e => setNom({ k, v: e.target.value })}
        onKeyDown={e => { if (e.key === 'Enter') enregistrerNom(); if (e.key === 'Escape') setNom(null); }} onBlur={enregistrerNom} />
    </div>
  ) : (
    <div className={x.tuileNom}><b>{l}</b>{sous && <small>{sous}</small>}</div>
  ));

  /* Replié ? Le choix d'Alexandre d'abord ; sinon, replié s'il est complet.
     Un filtre (À réunir, Demandés, Reçus) montre toujours tout. */
  const complet = (g: string) => {
    const ls = lignes.filter(l => l.groupe === g);
    return ls.length > 0 && ls.every(l => doss[l.k]?.etat === 'recu' || doss[l.k]?.etat === 'nc');
  };
  const replie = (g: string) => filtre === 'tout' && (g in replis ? replis[g] : g !== 'autres' && complet(g));
  const plier = (g: string, v: boolean) => setReplis(r => {
    const n = { ...r, [g]: v };
    try { localStorage.setItem(CLE_REPLIS, JSON.stringify(n)); } catch { /* sans mémoire */ }
    return n;
  });
  const toutPlier = (v: boolean) => {
    const n = Object.fromEntries(GROUPES.map(g => [g.k, v]));
    setReplis(n);
    try { localStorage.setItem(CLE_REPLIS, JSON.stringify(n)); } catch { /* sans mémoire */ }
  };
  /* L'en-tête d'un groupe : un bouton qui le plie ou le déplie, avec ses
     chiffres, et replié, ce qu'il reste à faire. */
  const teteGroupe = (g: (typeof GROUPES)[number], compte: ReactNode, resume: string, part: number | null) => {
    const r = replie(g.k);
    return (
      <button type="button" className={x.groupeT} aria-expanded={!r} onClick={() => plier(g.k, !r)} disabled={filtre !== 'tout'}>
        <span className={x.groupeIc}><Ic n={g.ic} t={14} /></span>
        <span className={x.groupeNom}>{g.l}</span>
        {compte && <i>{compte}</i>}
        {part !== null && <span className={x.groupeJauge} aria-hidden="true"><span style={{ width: `${Math.round(part * 100)}%` }} /></span>}
        {r && resume && <span className={x.groupeResume}>{resume}</span>}
        <span className={x.groupeFleche} data-ouvert={r ? 'non' : 'oui'}><Ic n="bas" t={14} e={2.4} /></span>
      </button>
    );
  };
  const resumeDe = (g: string) => {
    const ls = lignes.filter(l => l.groupe === g);
    const n = (e: string) => ls.filter(l => (doss[l.k]?.etat || '') === e).length;
    const aVoir = n('');
    return [n('recu') ? `${n('recu')} reçu${n('recu') > 1 ? 's' : ''}` : '', n('demande') ? `${n('demande')} demandé${n('demande') > 1 ? 's' : ''}` : '', aVoir ? `${aVoir} à voir` : '', !aVoir && !n('demande') ? 'tout est réglé' : ''].filter(Boolean).join(' · ');
  };

  const visible = (k: string) => {
    const e = doss[k]?.etat || '';
    return filtre === 'tout' || (filtre === 'reunir' ? e !== 'recu' && e !== 'nc' : filtre === 'demande' ? e === 'demande' : e === 'recu');
  };
  const poids = choisis.reduce((t, p) => t + (p.taille || 0), 0);
  const idees = (g: LigneDossier['groupe']) => [...(g === 'vendeur' && d.qui === 'sci' ? IDEES_SCI : []), ...IDEES[g]]
    .filter(t => !lignes.some(y => sansAccent(y.l) === sansAccent(t))).slice(0, 5);

  /* La tuile « + Ajouter une pièce » d'un groupe, ou son petit formulaire. */
  const tuileAjout = (g: LigneDossier['groupe']) => (filtre !== 'tout' ? null : ajout?.g === g ? (
    <div className={`${x.tuile} ${x.tuileAjout}`}>
      <div className={x.tuileNom}><b>Une pièce à ajouter</b><small>Le nom que tu veux : il apparaîtra comme les autres, avec reçu, demandé, le fichier.</small></div>
      <input className={x.nomEdit} value={ajout.v} autoFocus placeholder="Ex. : Kbis de la SCI" aria-label="Nom de la pièce"
        onChange={e => setAjout({ g, v: e.target.value })} onKeyDown={e => { if (e.key === 'Enter') ajouterPiece(); if (e.key === 'Escape') setAjout(null); }} />
      {idees(g).length > 0 && (
        <div className={x.idees}>{idees(g).map(t => <button key={t} type="button" onClick={() => setAjout({ g, v: t })}>{t}</button>)}</div>
      )}
      <div className={x.fichier}>
        <button type="button" className={`${x.btn} ${x.btnMarine}`} disabled={!ajout.v.trim()} onClick={ajouterPiece}><Ic n="check" t={14} e={2.6} />Ajouter</button>
        <button type="button" className={x.lien} onClick={() => setAjout(null)}>Annuler</button>
      </div>
    </div>
  ) : (
    <button type="button" className={x.ajouter} onClick={() => { setAjout({ g, v: '' }); setErreur(''); }}>
      <Ic n="plus" t={16} e={2.4} /><span>Ajouter une pièce<small>avec le nom de ton choix</small></span>
    </button>
  ));

  return (
    <section className={x.dossier} onDragOver={e => { e.preventDefault(); setSurvol(true); }} onDragLeave={e => { if (e.currentTarget === e.target) setSurvol(false); }} onDrop={surDepot}>
      <div className={x.tete}>
        <Anneau part={lignes.length ? faits / lignes.length : 0} taille={68} ep={8} c="#16a34a" fond="#eef1f6" texteC="#1a2332" texte={`${faits}/${lignes.length}`} label={`${faits} pièces du dossier réglées sur ${lignes.length}`} />
        <div className={x.teteTx}>
          <h3>Le dossier : diagnostics et pièces</h3>
          <span>{detail}{autres.length ? ` · ${autres.length} autre${autres.length > 1 ? 's' : ''} document${autres.length > 1 ? 's' : ''}` : ''}</span>
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
            <small>Plusieurs à la fois : le CRM reconnaît le DPE, l’amiante, les PV d’AG… à leur nom. Un dossier de diagnostics en un seul fichier se range aussi. PDF, JPG ou PNG, 25 Mo au plus.</small>
          </span>
        </button>
      ) : (
        <div className={x.ranger}>
          <div className={x.rangerT}>
            <b>{`${aRanger.length} fichier${aRanger.length > 1 ? 's' : ''} à ranger`}</b>
            <span>Vérifie ce que c’est, puis enregistre : chacun va à sa place dans le dossier.</span>
          </div>
          {aRanger.map(a => {
            const fige = a.etat === 'envoi' || a.etat === 'ok';
            return (
              <div key={a.id} className={x.rangerL} data-etat={a.etat} data-ddt={a.cle === DDT ? 'oui' : 'non'}>
                <span className={x.rangerIc}><Ic n={a.etat === 'ok' ? 'check' : a.cle === DDT ? 'dossier' : 'doc'} t={17} e={a.etat === 'ok' ? 2.8 : 1.9} /></span>
                <div className={x.rangerNom}><b>{a.f.name}</b><small>{a.etat === 'envoi' ? 'Envoi…' : a.etat === 'ok' ? 'Enregistré' : a.erreur || tailleFr(a.f.size)}</small></div>
                <div className={x.rangerChoix}>
                  <select value={a.cle} disabled={fige} aria-label={`Ce qu’est ${a.f.name}`} onChange={e => choisirSorte(a, e.target.value)}>
                    <option value={DDT}>Dossier de diagnostics complet (plusieurs en un fichier)…</option>
                    {GROUPES.filter(g => g.k !== 'autres').map(g => {
                      const ls = lignes.filter(l => l.groupe === g.k);
                      return ls.length ? <optgroup key={g.k} label={g.l}>{ls.map(l => <option key={l.k} value={l.k}>{`${l.l}${doss[l.k]?.chemin ? ' (remplace le fichier)' : ''}`}</option>)}</optgroup> : null;
                    })}
                    <option value={AUTRE}>Autre document, avec le nom de mon choix…</option>
                  </select>
                  {(a.cle === AUTRE || a.cle === DDT) && (
                    <input value={a.titre} placeholder={a.cle === DDT ? TITRE_DDT : 'Son nom (ex. : bail, plan du garage)'} disabled={fige}
                      onChange={e => majRanger(a.id, { titre: e.target.value })} aria-label="Nom du document" />
                  )}
                </div>
                <button type="button" className={x.icBtn} aria-label={`Ne pas garder ${a.f.name}`} disabled={a.etat === 'envoi'} onClick={() => setARanger(l => l.filter(y => y.id !== a.id))}><Ic n="croix" t={14} e={2.2} /></button>
                {a.cle === DDT && (
                  <div className={x.rangerDdt}>
                    <div className={x.rangerDdtT}>
                      <b>{`Il contient · ${a.contient.length}`}</b>
                      <button type="button" className={x.lien} disabled={fige} onClick={() => majRanger(a.id, { contient: diags.map(l => l.k) })}>Tout</button>
                      <button type="button" className={x.lien} disabled={fige} onClick={() => majRanger(a.id, { contient: [] })}>Aucun</button>
                    </div>
                    <Contenu lignes={diags} on={a.contient} desactive={fige}
                      onBasculer={k => majRanger(a.id, { contient: a.contient.includes(k) ? a.contient.filter(y => y !== k) : [...a.contient, k] })} />
                    <small>Le fichier n’est gardé qu’une fois ; chaque diagnostic coché passe « Reçu » et renvoie vers lui.</small>
                  </div>
                )}
              </div>
            );
          })}
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

      <div className={x.outils}>
        <div className={x.filtres} role="group" aria-label="Filtrer le dossier">
          {([['tout', 'Tout', lignes.length], ['reunir', 'À réunir', reunir], ['demande', 'Demandés', demandes], ['recu', 'Reçus', recus]] as const).map(([k, l, nb]) => (
            <button key={k} type="button" aria-pressed={filtre === k} onClick={() => setFiltre(k)}>{l}<i>{nb}</i></button>
          ))}
        </div>
        {filtre === 'tout' && (
          <span className={x.plis}>
            <button type="button" className={x.lien} onClick={() => toutPlier(true)}><Ic n="haut" t={13} e={2.4} />Tout replier</button>
            <button type="button" className={x.lien} onClick={() => toutPlier(false)}><Ic n="bas" t={13} e={2.4} />Tout déplier</button>
          </span>
        )}
      </div>

      {GROUPES.map(g => {
        if (g.k === 'autres') {
          if (filtre !== 'tout' && (filtre !== 'recu' || !autres.length)) return null;
          return (
            <div key={g.k} className={x.groupe}>
              {teteGroupe(g, autres.length ? autres.length : null, autres.length ? `${autres.length} document${autres.length > 1 ? 's' : ''}` : 'aucun', null)}
              {!replie(g.k) && <div className={x.grille}>
                {autres.map(f => (
                  <div key={f.id} className={x.tuile} data-etat="recu" data-choisi={choix.includes(f.chemin) ? 'oui' : 'non'}>
                    <div className={x.tuileT}>
                      <button type="button" className={x.coche} aria-pressed={choix.includes(f.chemin)} aria-label={`Choisir ${f.titre || f.nom} pour l’envoyer`} onClick={() => basculer(f.chemin)}><Ic n="check" t={12} e={3.2} /></button>
                      {nomDe(f.id, f.titre || titreDeFichier(f.nom), [f.le ? `Déposé le ${dateFr(f.le)}` : '', tailleFr(f.taille)].filter(Boolean).join(' · '))}
                      {nom?.k !== f.id && <button type="button" className={x.icBtn} aria-label="Renommer" title="Renommer" onClick={() => setNom({ k: f.id, v: f.titre || titreDeFichier(f.nom) })}><Ic n="crayon" t={13} /></button>}
                    </div>
                    <div className={x.fichier}>
                      <button type="button" className={x.fichierNom} onClick={() => ouvrirPiece(f.chemin, f.nom)}><Ic n="trombone" t={13} /><span>{f.nom}</span></button>
                      <button type="button" className={x.icBtn} aria-label="Retirer ce document" disabled={occupe === f.id} onClick={() => retirerFichier(f)}><Ic n="corbeille" t={14} /></button>
                    </div>
                  </div>
                ))}
                {filtre === 'tout' && (
                  <button type="button" className={x.ajouter} onClick={() => champ.current?.click()}>
                    <Ic n="plus" t={16} e={2.4} /><span>Ajouter un document<small>un bail, un plan… tu choisis son nom</small></span>
                  </button>
                )}
              </div>}
            </div>
          );
        }
        const ls = lignes.filter(l => l.groupe === g.k);
        const vus = ls.filter(l => visible(l.k));
        const lesDdt = g.k === 'diag' && (filtre === 'tout' || filtre === 'recu') ? ddts : [];
        if (!ls.length && filtre !== 'tout') return null;
        if (!vus.length && !lesDdt.length && filtre !== 'tout') return null;
        const ok = ls.filter(l => doss[l.k]?.etat === 'recu' || doss[l.k]?.etat === 'nc').length;
        return (
          <div key={g.k} className={x.groupe}>
            {teteGroupe(g, `${ok} sur ${ls.length}`, resumeDe(g.k), ls.length ? ok / ls.length : 0)}
            {!replie(g.k) && <div className={x.grille}>
              {/* Le dossier de diagnostics en un seul fichier : en tête, sur toute la largeur. */}
              {lesDdt.map(f => {
                const c = couverts(f.id);
                const edit = contenuDe === f.id;
                return (
                  <div key={f.id} className={x.ddt} data-choisi={choix.includes(f.chemin) ? 'oui' : 'non'}>
                    <div className={x.ddtT}>
                      <button type="button" className={x.coche} aria-pressed={choix.includes(f.chemin)} aria-label={`Choisir ${f.titre || TITRE_DDT} pour l’envoyer`} onClick={() => basculer(f.chemin)}><Ic n="check" t={12} e={3.2} /></button>
                      <span className={x.ddtIc}><Ic n="dossier" t={20} /></span>
                      {nomDe(f.id, f.titre || TITRE_DDT, `Un seul fichier pour ${c.length} diagnostic${c.length > 1 ? 's' : ''}${f.le ? ` · déposé le ${dateFr(f.le)}` : ''}${f.taille ? ` · ${tailleFr(f.taille)}` : ''}`)}
                      {nom?.k !== f.id && <button type="button" className={x.icBtn} aria-label="Renommer" title="Renommer" onClick={() => setNom({ k: f.id, v: f.titre || TITRE_DDT })}><Ic n="crayon" t={13} /></button>}
                    </div>
                    {edit
                      ? <Contenu lignes={diags} on={c.map(l => l.k)} onBasculer={k => basculerContenu(f, k)} />
                      : <div className={x.contenu}>{c.length ? c.map(l => <span key={l.k} className={x.puceLue}><Ic n="check" t={11} e={3} />{l.l}</span>) : <span className={x.aide}>Il ne couvre encore aucun diagnostic : « Ce qu’il contient » pour les cocher.</span>}</div>}
                    <div className={x.fichier}>
                      <button type="button" className={x.fichierNom} onClick={() => ouvrirPiece(f.chemin, f.nom)} title={f.nom}><Ic n="trombone" t={13} /><span>{f.nom}</span></button>
                      <button type="button" className={`${x.btn} ${edit ? x.btnMarine : ''}`} onClick={() => setContenuDe(edit ? '' : f.id)}>{edit ? <><Ic n="check" t={14} e={2.6} />Terminé</> : 'Ce qu’il contient…'}</button>
                      <button type="button" className={x.icBtn} aria-label="Retirer ce dossier de diagnostics" disabled={occupe === f.id} onClick={() => retirerFichier(f)}><Ic n="corbeille" t={14} /></button>
                    </div>
                  </div>
                );
              })}
              {vus.map(l => {
                const p = doss[l.k] || VIDE;
                const etat: EtatPiece = p.etat;
                const ddt = ddtDe(l.k);
                const chemin = p.chemin || ddt?.chemin || '';
                const perso = estPerso(l.k);
                return (
                  <div key={l.k} className={x.tuile} data-etat={etat || 'vide'} data-choisi={chemin && choix.includes(chemin) ? 'oui' : 'non'}>
                    <div className={x.tuileT}>
                      {chemin
                        ? <button type="button" className={x.coche} aria-pressed={choix.includes(chemin)} aria-label={`Choisir ${l.l} pour l’envoyer`} onClick={() => basculer(chemin)}><Ic n="check" t={12} e={3.2} /></button>
                        : <span className={x.pastille} data-etat={etat || 'vide'} aria-hidden="true">{etat === 'nc' ? '–' : etat === 'demande' ? '!' : ''}</span>}
                      {perso ? nomDe(l.k, l.l, 'Ajoutée par toi') : <div className={x.tuileNom}><b>{l.l}</b>{l.aide && <small>{l.aide}</small>}</div>}
                      {perso && nom?.k !== l.k && (
                        <>
                          <button type="button" className={x.icBtn} aria-label={`Renommer ${l.l}`} title="Renommer" onClick={() => setNom({ k: l.k, v: l.l })}><Ic n="crayon" t={13} /></button>
                          <button type="button" className={x.icBtn} aria-label={`Retirer ${l.l} du dossier`} title="Retirer du dossier" disabled={occupe === l.k} onClick={() => retirerPerso(l.k, l.l)}><Ic n="croix" t={13} e={2.2} /></button>
                        </>
                      )}
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
                        ) : ddt ? (
                          <>
                            <button type="button" className={`${x.fichierNom} ${x.fichierDans}`} onClick={() => ouvrirPiece(ddt.chemin, ddt.nom)} title={`Dans ${ddt.titre || TITRE_DDT} (${ddt.nom})`}><Ic n="dossier" t={13} /><span>{!ddt.titre || ddt.titre === TITRE_DDT ? 'Dans le DDT' : `Dans « ${ddt.titre} »`}</span></button>
                            <button type="button" className={x.icBtn} aria-label="Ne plus le compter dans le dossier de diagnostics" title="Pas dans ce fichier" onClick={() => basculerContenu(ddt, l.k)}><Ic n="croix" t={13} e={2.2} /></button>
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
              {tuileAjout(g.k)}
            </div>}
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
        <FenEnvoiDocuments bienId={bienId} pieces={envoyables} depart={choisis.map(p => p.chemin)} destinataires={destinataires} lieu={lieu}
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
