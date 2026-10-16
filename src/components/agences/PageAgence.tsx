'use client';
import { useEffect, useRef, useState } from 'react';
import { PDF_MAX, criteresAgence, type ResumeAgence } from '@/lib/agences-lien';
import { aDesInfos, estPdf, lirePdfIci, type InfosPdf, type LecturePdf } from '@/lib/pdf-navigateur';

/**
 * La page qu'ouvre une agence : espace.emilio-immo.com/proposer/<jeton> (V3.197).
 *
 * Alexandre : « quand une agence me dit d'aller voir sur son site, qu'elle
 * puisse me l'envoyer et que ça arrive direct dans la veille ». Maquettes
 * validées le 15 octobre (canevas « Le lien pour les agences »).
 *
 *   - en haut : Alexandre, et ce que cherche son client (sans nom) ;
 *   - « Votre bien » : le lien de l'annonce, lu aussitôt (« Annonce lue ·
 *     3 pièces 52 m² · 265 000 € · 8 photos ») ; sinon des photos, l'adresse,
 *     le prix, la surface ; un mot ;
 *   - « Vous » : l'agence, le nom, le téléphone — gardés sur l'appareil ;
 *   - « Envoyer à Alexandre », puis « C'est arrivé chez Alexandre ».
 * Téléphone : une colonne. Ordinateur : deux (la recherche à gauche, le
 * formulaire à droite). Composants au niveau du module (AGENTS.md §2.4).
 *
 * V3.198 — « Vos envois pour ce client » sous le formulaire, dès qu'elle a
 * envoyé quelque chose depuis cet appareil ; un « ? » explique que la liste
 * est gardée sur l'appareil (Alexandre : « pour leur faire comprendre que
 * l'historique se base uniquement sur ce poste »).
 *
 * V3.202 — Le PDF (maquettes 12, 13 et 15) : « Déposer un PDF » à côté des
 * photos ; lu ici, tout de suite et gratuitement (src/lib/pdf-navigateur.ts) :
 * « Lecture du PDF… », puis « PDF lu » avec ce qu'il dit, ou « PDF reçu ».
 * À l'envoi, le PDF part tout droit dans le dossier privé (api/agences/pdf),
 * puis la proposition (api/agences/proposer) ; le serveur le lit ensuite en
 * entier. Et le code au bout du lien (`?de=`) : quand Alexandre a envoyé le
 * lien à cette personne depuis le CRM, « Vous » arrive déjà rempli
 * (« Repris du message d'Alexandre », avec « Modifier ») ; ce que
 * l'appareil a gardé passe avant (c'est elle qui l'a tapé).
 *
 * V3.202 — Plus vivante (maquettes 12 et 13, validées le 16 octobre) :
 * Alexandre, « un petit logo d'appartement, deux ou trois pièces, logo, la
 * surface, logo, localisation, logo, prix… que ça soit plus vivant, là c'est
 * trop brut » et « que ce soit fluide quand il appuie ». Chaque critère dans
 * sa tuile à icône, « Important pour lui » et « Ses précisions » encadrés,
 * une icône dans chaque case, et des transitions douces (les cartes
 * montent, les lectures apparaissent en fondu, les boutons répondent) —
 * coupées quand le téléphone demande moins d'animations.
 */

type Apercu = { titre: string | null; prix: number | null; surface: number | null; pieces: number | null; chambres: number | null; etage: number | null; ville: string | null; balcon: boolean; terrasse: boolean; jardin: boolean; photos: number; photo: string | null };
type Lecture =
  | { etat: 'vide' }
  | { etat: 'lecture'; url: string }
  | { etat: 'ok' | 'partielle'; url: string; apercu: Apercu; fiche: unknown; signature: string }
  | { etat: 'echec'; url: string }
  | { etat: 'erreur'; url: string; message: string };
type Envoye = { titre: string; prix: number | null; le: string };
type EtatPdf = { etat: 'lecture'; fichier: File } | { etat: 'lu' | 'recu'; fichier: File; lu: LecturePdf };
type Vous = { agence: string; interlocuteur: string; tel: string; email: string };
/** Ce qu'Alexandre a noté de la personne à qui il a envoyé ce lien (le code `?de=`). */
export type VousRepris = { agence: string; interlocuteur: string | null; tel: string | null; email: string | null };

const TEL = '06 58 95 76 32';
const TEL_URL = '+33658957632';
const CLE_VOUS = 'emilio_agence_vous';
const cleEnvois = (t: string) => `emilio_agence_envois:${t}`;
const PHOTOS_MAX = 6;

const lireLocal = <T,>(cle: string, defaut: T): T => { try { const v = localStorage.getItem(cle); return v ? (JSON.parse(v) as T) : defaut; } catch { return defaut; } };
const ecrireLocal = (cle: string, v: unknown) => { try { localStorage.setItem(cle, JSON.stringify(v)); } catch { /* sans mémoire : on redemandera */ } };
const euros = (n: number) => `${Math.round(n).toLocaleString('fr-FR').replace(/[  ]/g, ' ')} €`;
const ressembleAUnLien = (s: string) => /^(https?:\/\/)?[a-z0-9-]+(\.[a-z0-9-]+)+(\/\S*)?$/i.test(s.trim()) || /https?:\/\/\S+/i.test(s);

function ligneApercu(a: Apercu): string {
  const bouts = [
    a.pieces ? `${a.pieces} pièce${a.pieces > 1 ? 's' : ''}` : null,
    a.surface ? `${String(a.surface).replace('.', ',')} m²` : null,
    a.prix ? euros(a.prix) : null,
  ].filter(Boolean);
  return bouts.join(' · ') || a.titre || 'Annonce';
}
/** « 3 pièces · 52 m² · 265 000 € » depuis ce que la page a trouvé dans le PDF. */
function ligneInfos(i: InfosPdf): string {
  return [
    i.pieces ? `${i.pieces} pièce${i.pieces > 1 ? 's' : ''}` : null,
    i.chambres && !i.pieces ? `${i.chambres} chambre${i.chambres > 1 ? 's' : ''}` : null,
    i.surface ? `${String(i.surface).replace('.', ',')} m²` : null,
    i.prix ? euros(i.prix) : null,
  ].filter(Boolean).join(' · ');
}
const taillePdf = (o: number) => (o < 1024 * 1024 ? `${Math.max(1, Math.round(o / 1024))} Ko` : `${(o / 1024 / 1024).toFixed(1).replace('.', ',')} Mo`);
const vousComplet = (v: { agence?: string | null; tel?: string | null; email?: string | null } | null | undefined) => !!v && !!String(v.agence || '').trim() && !!(String(v.tel || '').trim() || String(v.email || '').trim());
function detailApercu(a: Apercu): string {
  const etage = a.etage === null ? null : a.etage === 0 ? 'rez-de-chaussée' : a.etage === 1 ? '1er étage' : `${a.etage}e étage`;
  return [a.ville, etage, a.balcon ? 'balcon' : null, a.terrasse ? 'terrasse' : null, a.jardin ? 'jardin' : null,
    a.photos ? `${a.photos} photo${a.photos > 1 ? 's' : ''}` : null].filter(Boolean).join(' · ');
}

/* Une photo de téléphone pèse plusieurs Mo : réduite ici (1 600 px, JPEG). */
async function reduire(f: File): Promise<string | null> {
  if (!f.type.startsWith('image/')) return null;
  const adresse = URL.createObjectURL(f);
  try {
    const img = await new Promise<HTMLImageElement>((ok, ko) => {
      const i = new Image(); i.onload = () => ok(i); i.onerror = () => ko(new Error('illisible')); i.src = adresse;
    });
    const k = Math.min(1, 1600 / Math.max(img.naturalWidth || 1, img.naturalHeight || 1));
    const c = document.createElement('canvas');
    c.width = Math.max(1, Math.round(img.naturalWidth * k));
    c.height = Math.max(1, Math.round(img.naturalHeight * k));
    const ctx = c.getContext('2d');
    if (!ctx) return null;
    ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, c.height);
    ctx.drawImage(img, 0, 0, c.width, c.height);
    return c.toDataURL('image/jpeg', 0.8);
  } catch { return null; } finally { URL.revokeObjectURL(adresse); }
}

const ERREURS: Record<string, string> = {
  adresse: 'Ce lien ne ressemble pas à une adresse d’annonce. Copiez-le depuis la barre d’adresse de la page.',
  photo: 'Une photo n’a pas pu être envoyée. Réessayez avec une autre, ou sans photo.',
  vide: 'Collez le lien de l’annonce, ou ajoutez un PDF ou des photos.',
  pdf: 'Le PDF n’a pas pu être envoyé. Réessayez dans un instant, ou envoyez des photos.',
  pdf_lourd: 'Ce PDF est trop lourd (20 Mo au plus) : envoyez une version plus légère, ou des photos.',
  pdf_type: 'Ce fichier n’est pas un PDF.',
  pdf_protege: 'Ce PDF est protégé par un mot de passe : envoyez-le sans mot de passe, ou des photos.',
  pdf_indisponible: 'L’envoi de PDF n’est pas encore ouvert : envoyez des photos, ou appelez Alexandre.',
  agence: 'Indiquez le nom de votre agence.',
  contact: 'Indiquez un téléphone ou un e-mail, pour qu’Alexandre puisse vous rappeler.',
  trop: 'Beaucoup d’envois d’un coup : réessayez dans quelques minutes.',
  ferme: 'Cette recherche n’est plus ouverte.',
  lien: 'Ce lien n’est plus valable.',
  indisponible: 'L’envoi n’est pas encore ouvert : appelez Alexandre, il s’en occupe.',
};

/* ── Les icônes, dessinées ── */
function Ic({ n, t = 18 }: { n: 'coche' | 'fleche' | 'plus' | 'tel' | 'photo' | 'lien' | 'croix' | 'alerte' | 'cadenas' | 'pdf' | 'crayon' | 'bulle' | 'maison' | 'surface' | 'lieu' | 'budget' | 'etoile' | 'personne' | 'immeuble' | 'mail'; t?: number }) {
  const p: Record<string, React.ReactNode> = {
    coche: <path d="m5 12.5 4.5 4.5L19 7.5" />,
    fleche: <><path d="M4 12h15" /><path d="m13 6 6 6-6 6" /></>,
    plus: <><path d="M12 5v14" /><path d="M5 12h14" /></>,
    tel: <path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2" />,
    photo: <><rect x="3" y="5" width="18" height="14" rx="2.5" /><circle cx="9" cy="10.5" r="1.8" /><path d="m21 16-5-5-8 8" /></>,
    lien: <><path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1" /><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1" /></>,
    croix: <><path d="M6 6l12 12" /><path d="M18 6 6 18" /></>,
    alerte: <><path d="M12 3 2 20h20L12 3z" /><path d="M12 10v4" /><path d="M12 17.5v.5" /></>,
    cadenas: <><rect x="5" y="11" width="14" height="9" rx="2" /><path d="M8 11V8a4 4 0 0 1 8 0v3" /></>,
    pdf: <><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" /><path d="M14 3v5h5" /><path d="M9 13h6" /><path d="M9 17h4" /></>,
    crayon: <><path d="M4 20h4L19 9l-4-4L4 16z" /><path d="m13.5 6.5 4 4" /></>,
    bulle: <><path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12z" /><path d="M9 10.5h6" /><path d="M9 13.5h4" /></>,
    maison: <><path d="M3 11.5 12 4l9 7.5" /><path d="M5 10v10h14V10" /><path d="M10 20v-5h4v5" /></>,
    surface: <><rect x="4" y="4" width="16" height="16" rx="2.5" /><path d="M4 9h3" /><path d="M4 14h3" /><path d="M9 4v3" /><path d="M14 4v3" /></>,
    lieu: <><path d="M12 21s-7-6.2-7-11a7 7 0 0 1 14 0c0 4.8-7 11-7 11z" /><circle cx="12" cy="10" r="2.5" /></>,
    budget: <><path d="M17 6.5A7 7 0 1 0 17 17.5" /><path d="M4 10h9" /><path d="M4 14h9" /></>,
    etoile: <path d="m12 3.5 2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 16.9l-5.2 2.7 1-5.8-4.3-4.1 5.9-.9z" />,
    personne: <><circle cx="12" cy="8" r="4" /><path d="M4 21a8 8 0 0 1 16 0" /></>,
    immeuble: <><rect x="5" y="3" width="14" height="18" rx="1.5" /><path d="M9 7h2" /><path d="M13 7h2" /><path d="M9 11h2" /><path d="M13 11h2" /><path d="M10 21v-4h4v4" /></>,
    mail: <><rect x="3" y="5" width="18" height="14" rx="2.5" /><path d="m4 7 8 6 8-6" /></>,
  };
  return <svg width={t} height={t} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{p[n]}</svg>;
}

/* V3.197 — Alexandre : « sur PC, le bandeau, c'est que du bleu ; plus
   moderne, avec des choses à droite, à gauche ». À droite (ordinateur
   seulement) : les étapes, sur un léger motif. */
function Entete({ titre, sous, cote, salut }: { titre: string; sous: string; cote?: React.ReactNode; salut?: string }) {
  return (
    <header className="ag-tete">
      <div className="ag-tete-in">
        <div className="ag-tete-g">
          <div className="ag-marque"><span>EMILIO IMMOBILIER</span><span className="ag-marque-d">Recherche pour un acquéreur</span></div>
          <div className="ag-moi">
            <span className="ag-av" aria-hidden="true">AR</span>
            <span className="ag-moi-t"><b>Alexandre Rogelet</b><small>Emilio Immobilier · Vanves</small></span>
          </div>
          {salut && <span className="ag-salut">{salut}</span>}
          <h1>{titre}</h1>
          <p>{sous}</p>
        </div>
        {cote && <div className="ag-tete-d">{cote}</div>}
      </div>
    </header>
  );
}

function Etapes({ titre, etapes }: { titre: string; etapes: { t: string; s: string; fait?: boolean }[] }) {
  return (
    <div className="ag-etapes">
      <span className="ag-etapes-t">{titre}</span>
      <ol>
        {etapes.map((e, i) => (
          <li key={e.t} data-fait={e.fait ? '1' : undefined}>
            <span className="ag-etapes-n" aria-hidden="true">{e.fait ? <Ic n="coche" t={15} /> : String(i + 1)}</span>
            <span className="ag-etapes-x"><b>{e.t}</b><small>{e.s}</small></span>
          </li>
        ))}
      </ol>
    </div>
  );
}
const ETAPES_FORM = [
  { t: 'Collez le lien, ou déposez un PDF', s: 'Votre site, SeLoger, Leboncoin… une plaquette, ou quelques photos.' },
  { t: 'C’est lu automatiquement', s: 'Prix, surface, pièces : rien à ressaisir.' },
  { t: 'Alexandre vous rappelle', s: 'Si le bien correspond à son client.' },
];
const ETAPES_FAIT = [
  { t: 'Votre bien est arrivé', s: 'Chez Alexandre, avec vos coordonnées.', fait: true },
  { t: 'Il l’étudie pour son client', s: 'Il le compare à sa recherche.' },
  { t: 'Il revient vers vous', s: 'S’il intéresse son client, pour organiser une visite.' },
];

/* « Aujourd'hui », « Le 12 octobre » */
function quandEnvoi(iso: string) {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  if (d.toDateString() === new Date().toDateString()) return 'Aujourd’hui';
  return `Le ${d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' })}`;
}

/* V3.198 — Ce qu'elle a envoyé pour ce client depuis cet appareil, et le « ? ». */
function CarteEnvois({ envoyes }: { envoyes: Envoye[] }) {
  const [info, setInfo] = useState(false);
  const zone = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!info) return;
    const dehors = (e: PointerEvent) => { if (zone.current && !zone.current.contains(e.target as Node)) setInfo(false); };
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setInfo(false); };
    document.addEventListener('pointerdown', dehors);
    document.addEventListener('keydown', esc);
    return () => { document.removeEventListener('pointerdown', dehors); document.removeEventListener('keydown', esc); };
  }, [info]);
  return (
    <section className="ag-carte ag-hist" aria-label="Vos envois pour ce client">
      <div className="ag-hist-tete" ref={zone}>
        <span className="ag-hist-titre"><span className="ag-sur">VOS ENVOIS POUR CE CLIENT</span><span className="ag-hist-sous">Depuis cet appareil</span></span>
        <button type="button" className="ag-q" aria-expanded={info} aria-controls="ag-hist-info" aria-label="À propos de cette liste" onClick={() => setInfo(v => !v)}>?</button>
        {info && (
          <div id="ag-hist-info" className="ag-bulle" role="note">
            <b>Les envois faits depuis cet appareil</b>
            <span>{'Cette liste est gardée sur ce téléphone ou cet ordinateur. Ce que vous avez envoyé depuis un autre appareil n’y apparaît pas, mais Alexandre l’a bien reçu.'}</span>
            <button type="button" onClick={() => setInfo(false)}>Compris</button>
          </div>
        )}
      </div>
      {envoyes.map((e, i) => <span key={i} className="ag-hist-l"><span>{e.titre}</span><small>{quandEnvoi(e.le)}</small></span>)}
    </section>
  );
}

/* Ordinateur : la carte pour joindre Alexandre, sous la recherche. */
function CarteContact() {
  return (
    <section className="ag-carte ag-contact ag-pc" aria-label="Joindre Alexandre">
      <span className="ag-av ag-av-bleu" aria-hidden="true">AR</span>
      <span className="ag-contact-t"><b>Une question sur ce client ?</b><small>{'Alexandre Rogelet'}</small><small className="ag-tel">{TEL}</small></span>
      <a className="ag-contact-b" href={`tel:${TEL_URL}`} aria-label={`Appeler Alexandre au ${TEL}`}><Ic n="tel" t={16} /></a>
    </section>
  );
}

/* Le titre d'une carte, avec son icône. */
function TitreCarte({ n, children, cote }: { n: 'maison' | 'personne'; children: React.ReactNode; cote?: React.ReactNode }) {
  return (
    <div className="ag-titre-c">
      <span className="ag-titre-ic" aria-hidden="true"><Ic n={n} t={17} /></span>
      <h2>{children}</h2>
      {cote}
    </div>
  );
}
/* Une case avec son icône à gauche. */
function Saisie({ n, haut, children }: { n: 'lien' | 'lieu' | 'budget' | 'surface' | 'bulle' | 'immeuble' | 'personne' | 'tel' | 'mail'; haut?: boolean; children: React.ReactNode }) {
  return <div className="ag-saisie" data-haut={haut ? '1' : undefined}><Ic n={n} t={17} />{children}</div>;
}

function CarteRecherche({ resume }: { resume: ResumeAgence }) {
  const crit = criteresAgence(resume);
  return (
    <section className="ag-carte ag-rech" aria-label="Ce que cherche mon client">
      <span className="ag-sur">CE QUE CHERCHE MON CLIENT</span>
      <div className="ag-tuiles">
        {crit.map(c => (
          <div key={c.ico} className="ag-tuile" data-or={c.or ? '1' : undefined}>
            <span className="ag-tuile-ic" aria-hidden="true"><Ic n={c.ico} t={19} /></span>
            <span className="ag-tuile-t"><b>{c.titre}</b><small>{c.sous}</small></span>
          </div>
        ))}
      </div>
      {resume.important.length > 0 && (
        <div className="ag-boite ag-boite-vert">
          <span className="ag-boite-t"><Ic n="etoile" t={16} />IMPORTANT POUR LUI</span>
          {resume.important.map(x => <span key={x} className="ag-imp-l"><span className="ag-coche" aria-hidden="true"><Ic n="coche" t={13} /></span><span>{x}</span></span>)}
        </div>
      )}
      {resume.precisions && (
        <div className="ag-boite">
          <span className="ag-boite-t ag-boite-bleu"><Ic n="bulle" t={16} />SES PRÉCISIONS</span>
          <p className="ag-prec">{resume.precisions}</p>
        </div>
      )}
    </section>
  );
}

/* V3.202 — Le PDF déposé : « Lecture du PDF… », « PDF lu » (ce qu'il dit), « PDF reçu ». */
function CartePdf({ pdf, onRetirer }: { pdf: EtatPdf; onRetirer: () => void }) {
  const f = pdf.fichier;
  if (pdf.etat === 'lecture') {
    return (
      <div className="ag-lu ag-lu-attente" role="status">
        <span className="ag-rond" aria-hidden="true" />
        <span className="ag-lu-t"><b>Lecture du PDF…</b><small>{`${f.name} · une à deux secondes`}</small></span>
      </div>
    );
  }
  const { lu } = pdf;
  const pages = lu.pages ? `${lu.pages} page${lu.pages > 1 ? 's' : ''} · ` : '';
  const retirer = (
    <button type="button" className="ag-pdf-x" onClick={onRetirer} aria-label="Retirer le PDF" title="Retirer le PDF"><Ic n="croix" t={15} /></button>
  );
  const vignette = lu.apercu ? <img src={lu.apercu} alt="" className="ag-pdf-ph" /> : <span className="ag-pdf-ph ag-pdf-ph-vide"><Ic n="pdf" t={20} /></span>;
  if (pdf.etat === 'lu') {
    return (
      <div className="ag-lu ag-pdf" role="status">
        {vignette}
        <span className="ag-lu-t">
          <span className="ag-lu-ok"><Ic n="coche" t={13} />PDF lu</span>
          <b>{ligneInfos(lu.infos)}</b>
          <small className="ag-pdf-nom">{`${pages}${f.name}`}</small>
        </span>
        {retirer}
      </div>
    );
  }
  return (
    <div className="ag-lu ag-pdf ag-pdf-recu" role="status">
      <div className="ag-pdf-haut">
        {vignette}
        <span className="ag-lu-t">
          <span className="ag-lu-ok ag-lu-bleu"><Ic n="coche" t={13} />PDF reçu</span>
          <b className="ag-pdf-nom">{f.name}</b>
          <small>{`${pages}${taillePdf(f.size)}`}</small>
        </span>
        {retirer}
      </div>
      <span className="ag-pdf-aide">{'Alexandre le lira de son côté. Vous pouvez ajouter le prix et la surface juste en dessous, si vous voulez.'}</span>
    </div>
  );
}

/* V3.202 — « Vous », déjà rempli : repris du message d'Alexandre, ou gardé sur l'appareil. */
function CarteVous({ vous, repris, onModifier }: { vous: Vous; repris: boolean; onModifier: () => void }) {
  const nom = vous.interlocuteur.trim();
  const ini = (nom || vous.agence).split(/\s+/).filter(Boolean).slice(0, 2).map(m => m[0]?.toUpperCase() || '').join('') || '?';
  return (
    <section className="ag-carte" aria-label="Vous">
      <TitreCarte n="personne" cote={<span className="ag-pastille">{repris ? 'Repris du message d’Alexandre' : 'Gardé sur cet appareil'}</span>}>Vous</TitreCarte>
      <div className="ag-vous">
        <span className="ag-av ag-av-plein" aria-hidden="true">{ini}</span>
        <span className="ag-vous-t">
          <b>{nom || vous.agence}</b>
          {nom && <span className="ag-vous-l"><Ic n="immeuble" t={14} /><span>{vous.agence}</span></span>}
          <span className="ag-vous-ls">
            {vous.tel.trim() && <span className="ag-vous-l"><Ic n="tel" t={14} /><span>{vous.tel.trim()}</span></span>}
            {vous.email.trim() && <span className="ag-vous-l"><Ic n="mail" t={14} /><span>{vous.email.trim()}</span></span>}
          </span>
        </span>
        <button type="button" className="ag-modif" onClick={onModifier} aria-label="Modifier mes coordonnées"><Ic n="crayon" t={15} /><span>Modifier</span></button>
      </div>
      <span className="ag-aide">{repris ? 'Ce n’est pas vous ? Appuyez sur Modifier et mettez vos coordonnées.' : 'Ce n’est plus vous ? Appuyez sur Modifier.'}</span>
    </section>
  );
}

function Fermee({ inconnu }: { inconnu: boolean }) {
  return (
    <main className="ag-page">
      <Entete titre={inconnu ? 'Ce lien n’est plus valable' : 'Cette recherche n’est plus ouverte'}
        sous={inconnu ? 'Il a peut-être été remplacé. Alexandre vous en enverra un nouveau.' : 'Merci pour votre aide ! Pour un autre client, Alexandre vous enverra un nouveau lien.'} />
      <div className="ag-corps ag-corps-un">
        <a className="ag-btn ag-btn-blanc" href={`tel:${TEL_URL}`}><Ic n="tel" t={17} /><span>{`Appeler Alexandre · ${TEL}`}</span></a>
      </div>
    </main>
  );
}

export default function PageAgence({ etat, token, resume, repris, code }: {
  etat: 'ouvert' | 'ferme' | 'inconnu'; token?: string; resume?: ResumeAgence;
  /** V3.202 : la personne à qui Alexandre a envoyé ce lien (le code `?de=`), et ce code */
  repris?: VousRepris | null; code?: string | null;
}) {
  const [lien, setLien] = useState('');
  const [lecture, setLecture] = useState<Lecture>({ etat: 'vide' });
  const [photos, setPhotos] = useState<string[]>([]);
  const [adresse, setAdresse] = useState('');
  const [prix, setPrix] = useState('');
  const [surface, setSurface] = useState('');
  const [mot, setMot] = useState('');
  const [vous, setVous] = useState<Vous>({ agence: '', interlocuteur: '', tel: '', email: '' });
  /* « form » : les cases ; « repris » / « memoire » : déjà rempli, en une ligne, avec « Modifier ». */
  const [vousVue, setVousVue] = useState<'form' | 'repris' | 'memoire'>('form');
  const [salut, setSalut] = useState('');
  const [pdf, setPdf] = useState<EtatPdf | null>(null);
  const [etape, setEtape] = useState<'pdf' | 'bien' | null>(null);
  /* Un PDF refusé (trop lourd, pas un PDF, protégé) : le message juste sous le bouton, là où elle regarde. */
  const [pdfErreur, setPdfErreur] = useState<string | null>(null);
  const fichierPdf = useRef<HTMLInputElement>(null);
  const [envoi, setEnvoi] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const [fait, setFait] = useState<{ apercu: Apercu | null; deja?: boolean } | null>(null);
  const [envoyes, setEnvoyes] = useState<Envoye[]>([]);
  const fichier = useRef<HTMLInputElement>(null);
  const derniereLue = useRef('');

  useEffect(() => {
    /* Ce que l'appareil a gardé (c'est elle qui l'a tapé) passe avant le code du lien. */
    const local = lireLocal<Partial<Vous>>(CLE_VOUS, {});
    let v: Vous | null = null;
    if (vousComplet(local)) { v = { agence: '', interlocuteur: '', tel: '', email: '', ...local }; setVousVue('memoire'); }
    else if (repris && vousComplet(repris)) {
      v = { agence: repris.agence, interlocuteur: repris.interlocuteur || '', tel: repris.tel || '', email: repris.email || '' };
      setVousVue('repris');
    }
    if (v) { setVous(v); setSalut(v.interlocuteur.trim().split(/\s+/)[0] || ''); }
    else setVous(x => ({ ...x, ...local }));
    if (token) setEnvoyes(lireLocal<Envoye[]>(cleEnvois(token), []));
  }, [token, repris]);

  /* Le lien est lu dès qu'il ressemble à une adresse (collé, ou frappe finie). */
  useEffect(() => {
    const u = lien.trim();
    if (!token || !u || !ressembleAUnLien(u) || u === derniereLue.current) return;
    const t = window.setTimeout(() => { void lire(u); }, 700);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lien, token]);

  async function lire(u: string) {
    derniereLue.current = u;
    setLecture({ etat: 'lecture', url: u });
    try {
      const r = await fetch('/api/agences/lire', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token, url: u }) });
      const d = await r.json().catch(() => null) as { ok?: boolean; etat?: string; apercu?: Apercu; fiche?: unknown; signature?: string; error?: string } | null;
      if (derniereLue.current !== u) return;
      if (!r.ok || !d?.ok) { setLecture({ etat: 'erreur', url: u, message: ERREURS[d?.error || ''] || 'La lecture n’a pas répondu. Vous pouvez envoyer le lien tel quel.' }); return; }
      if ((d.etat === 'ok' || d.etat === 'partielle') && d.apercu && d.signature) setLecture({ etat: d.etat, url: u, apercu: d.apercu, fiche: d.fiche, signature: d.signature });
      else setLecture({ etat: 'echec', url: u });
    } catch {
      if (derniereLue.current === u) setLecture({ etat: 'erreur', url: u, message: 'La lecture n’a pas répondu. Vous pouvez envoyer le lien tel quel.' });
    }
  }

  async function ajouterPhotos(liste: FileList | null) {
    if (!liste) return;
    const place = PHOTOS_MAX - photos.length;
    const lues = (await Promise.all(Array.from(liste).slice(0, Math.max(0, place)).map(reduire))).filter((x): x is string => !!x);
    if (lues.length) setPhotos(p => [...p, ...lues].slice(0, PHOTOS_MAX));
    if (fichier.current) fichier.current.value = '';
  }

  /* V3.202 — Le PDF : lu ici tout de suite ; il part avec le reste, à l'envoi. */
  async function ajouterPdf(liste: FileList | null) {
    const f = liste?.[0];
    if (fichierPdf.current) fichierPdf.current.value = '';
    if (!f) return;
    if (!estPdf(f)) { setPdfErreur(ERREURS.pdf_type); return; }
    if (f.size > PDF_MAX) { setPdfErreur(`Ce PDF fait ${taillePdf(f.size)} : c’est trop lourd (20 Mo au plus). Envoyez une version plus légère, ou des photos.`); return; }
    setPdfErreur(null); setErreur(null);
    setPdf({ etat: 'lecture', fichier: f });
    const lu = await lirePdfIci(f);
    if (lu.protege) { setPdf(p => (p?.fichier === f ? null : p)); setPdfErreur(ERREURS.pdf_protege); return; }
    setPdf(p => (p?.fichier === f ? { etat: aDesInfos(lu.infos) ? 'lu' : 'recu', fichier: f, lu } : p));
  }

  /* Le PDF, tout droit dans le dossier privé (un lien d'envoi signé) : son chemin, ou l'erreur. */
  async function deposerPdf(p: Exclude<EtatPdf, { etat: 'lecture' }>): Promise<{ chemin: string } | { erreur: string }> {
    try {
      const r = await fetch('/api/agences/pdf', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token, taille: p.fichier.size }) });
      const d = await r.json().catch(() => null) as { ok?: boolean; chemin?: string; url?: string; error?: string } | null;
      if (!r.ok || !d?.ok || !d.chemin || !d.url) return { erreur: ERREURS[d?.error || ''] || ERREURS.pdf };
      const corps = new FormData();
      corps.append('cacheControl', '3600');
      /* Toujours « application/pdf » : un téléphone donne parfois un type vide, que le dossier refuserait. */
      corps.append('', new File([p.fichier], p.fichier.name, { type: 'application/pdf' }), p.fichier.name);
      const cle = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
      const envoi = await fetch(d.url, { method: 'PUT', headers: { 'x-upsert': 'false', ...(cle ? { apikey: cle, Authorization: `Bearer ${cle}` } : {}) }, body: corps });
      if (!envoi.ok) { console.error('[pdf] dépôt', envoi.status, await envoi.text().catch(() => '')); return { erreur: ERREURS.pdf }; }
      return { chemin: d.chemin };
    } catch {
      return { erreur: ERREURS.pdf };
    }
  }

  async function envoyer() {
    if (envoi || !token) return;
    setErreur(null);
    const u = lien.trim();
    if (!u && !photos.length && !pdf) { setErreur(ERREURS.vide); return; }
    if (pdf?.etat === 'lecture') return;
    if (!vous.agence.trim()) { setErreur(ERREURS.agence); setVousVue('form'); return; }
    if (!vous.tel.trim() && !vous.email.trim()) { setErreur(ERREURS.contact); setVousVue('form'); return; }
    setEnvoi(true);
    ecrireLocal(CLE_VOUS, vous);
    const lu = (lecture.etat === 'ok' || lecture.etat === 'partielle') && lecture.url === u ? lecture : null;
    const lp = pdf; /* jamais « lecture » ici : retour plus haut */
    try {
      let pdfEnvoye: Record<string, unknown> | null = null;
      if (lp) {
        setEtape('pdf');
        const r = await deposerPdf(lp);
        if ('erreur' in r) { setErreur(r.erreur); return; }
        pdfEnvoye = { chemin: r.chemin, nom: lp.fichier.name, pages: lp.lu.pages };
      }
      setEtape('bien');
      const r = await fetch('/api/agences/proposer', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          token, url: u || null, fiche: lu?.fiche || null, signature: lu?.signature || null,
          photos, adresse, prix, surface, mot, ...vous,
          ...(lp && pdfEnvoye ? { pdf: pdfEnvoye, pdf_apercu: lp.lu.apercu, pdf_texte: lp.lu.texte, pdf_infos: lp.lu.infos } : {}),
          de: code || null,
        }),
      });
      const d = await r.json().catch(() => null) as { ok?: boolean; deja?: boolean; apercu?: Apercu; error?: string } | null;
      if (!r.ok || !d?.ok) { setErreur(ERREURS[d?.error || ''] || 'L’envoi n’est pas passé. Réessayez dans un instant.'); return; }
      if (d.deja) { setFait({ apercu: lu?.apercu || null, deja: true }); return; }
      const a0 = d.apercu || lu?.apercu || null;
      /* Un bien envoyé en PDF : la première page sert d'image sur la confirmation. */
      const a = a0 && !a0.photo && lp?.lu.apercu ? { ...a0, photo: lp.lu.apercu } : a0;
      const nouveau: Envoye = { titre: a && (a.prix || a.surface || a.pieces) ? ligneApercu(a) : (u ? 'Votre annonce' : lp ? lp.fichier.name : 'Vos photos'), prix: a?.prix || null, le: new Date().toISOString() };
      const l = [nouveau, ...envoyes].slice(0, 12);
      setEnvoyes(l); ecrireLocal(cleEnvois(token), l);
      setFait({ apercu: a });
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch {
      setErreur('L’envoi n’est pas passé. Vérifiez votre connexion et réessayez.');
    } finally {
      setEnvoi(false); setEtape(null);
    }
  }

  function autre() {
    setFait(null); setLien(''); setLecture({ etat: 'vide' }); derniereLue.current = '';
    setPhotos([]); setPdf(null); setPdfErreur(null); setAdresse(''); setPrix(''); setSurface(''); setMot(''); setErreur(null);
    if (vousComplet(vous)) setVousVue(v => (v === 'form' ? 'memoire' : v));
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  if (etat !== 'ouvert' || !token || !resume) {
    return <><style>{CSS}</style><Fermee inconnu={etat === 'inconnu'} /></>;
  }

  const prenomAgent = vous.interlocuteur.trim().split(/\s+/)[0] || '';

  return (
    <>
      <style>{CSS}</style>
      <main className="ag-page">
        {fait ? (
          <>
            <Entete titre={fait.deja ? 'Alexandre l’a déjà' : 'C’est arrivé chez Alexandre'}
              sous={fait.deja ? 'Ce bien est déjà chez lui pour ce client. Merci !' : `Il l’étudie pour son client et revient vers vous.${prenomAgent ? ` Merci, ${prenomAgent}.` : ' Merci !'}`}
              cote={fait.deja ? undefined : <Etapes titre="Et maintenant ?" etapes={ETAPES_FAIT} />} />
            <div className="ag-corps ag-corps-fait">
              <section className="ag-carte ag-recap">
                <div className="ag-recap-haut">
                  <span className="ag-fait-ic"><Ic n="coche" t={24} /></span>
                  <span className="ag-recap-t">
                    <b>{fait.deja ? 'Déjà chez Alexandre' : 'Bien envoyé'}</b>
                    <small>{fait.deja ? 'Rien à refaire : il l’a pour ce client.' : `Aujourd’hui à ${new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }).replace(':', ' h ')}`}</small>
                  </span>
                </div>
                {fait.apercu && (
                  <div className="ag-recap-bien">
                    {fait.apercu.photo ? <img src={fait.apercu.photo} alt="" className="ag-recap-ph" /> : <span className="ag-recap-ph" />}
                    <span className="ag-lu-t"><b>{ligneApercu(fait.apercu)}</b><small>{detailApercu(fait.apercu)}</small></span>
                  </div>
                )}
                <div className="ag-recap-act">
                  <button type="button" className="ag-btn ag-btn-bleu" onClick={autre}><Ic n="plus" t={18} /><span>Proposer un autre bien</span></button>
                  <a className="ag-btn ag-btn-blanc ag-mob" href={`tel:${TEL_URL}`}><Ic n="tel" t={17} /><span>{`Appeler Alexandre · ${TEL}`}</span></a>
                </div>
              </section>
              <div className="ag-droite">
                {envoyes.length > 0 && <CarteEnvois envoyes={envoyes} />}
                <CarteContact />
              </div>
            </div>
          </>
        ) : (
          <>
            <Entete titre="Un bien pour mon client ?" sous="Déposez-le ici : il arrive directement chez moi. Je l’étudie et je reviens vers vous."
              salut={salut ? `Bonjour ${salut},` : undefined}
              cote={<Etapes titre="Comment ça marche" etapes={ETAPES_FORM} />} />
            <div className="ag-corps">
              <div className="ag-gauche">
                <CarteRecherche resume={resume} />
                <CarteContact />
                <p className="ag-note"><Ic n="cadenas" t={14} /><span>Vos coordonnées servent seulement à vous rappeler pour ce bien.</span></p>
              </div>

              <div className="ag-droite">
                <section className="ag-carte" aria-label="Votre bien">
                  <TitreCarte n="maison">Votre bien</TitreCarte>
                  <div className="ag-champ">
                    <label htmlFor="ag-lien">Le lien de l’annonce</label>
                    <span className="ag-aide">{'Celui de votre site d’agence, de SeLoger, de Leboncoin ou de tout autre site : collez-le, tout est repris automatiquement, photos comprises.'}</span>
                    <Saisie n="lien"><input id="ag-lien" type="url" inputMode="url" autoComplete="off" placeholder="https://…" value={lien}
                      onChange={e => { setLien(e.target.value); if (!e.target.value.trim()) { setLecture({ etat: 'vide' }); derniereLue.current = ''; } }}
                      onBlur={() => { const u = lien.trim(); if (u && u !== derniereLue.current) void lire(u); }} /></Saisie>
                    {lecture.etat === 'lecture' && (
                      <div className="ag-lu ag-lu-attente" role="status"><span className="ag-rond" aria-hidden="true" /><span className="ag-lu-t"><b>Lecture de l’annonce…</b><small>Quelques secondes.</small></span></div>
                    )}
                    {(lecture.etat === 'ok' || lecture.etat === 'partielle') && (
                      <div className="ag-lu" role="status">
                        {lecture.apercu.photo ? <img src={lecture.apercu.photo} alt="" className="ag-lu-ph" /> : <span className="ag-lu-ph" />}
                        <span className="ag-lu-t">
                          <span className="ag-lu-ok"><Ic n="coche" t={13} />{lecture.etat === 'ok' ? 'Annonce lue' : 'Annonce lue en partie'}</span>
                          <b>{ligneApercu(lecture.apercu)}</b>
                          <small>{detailApercu(lecture.apercu) || 'Complétez ci-dessous si besoin.'}</small>
                        </span>
                      </div>
                    )}
                    {(lecture.etat === 'echec' || lecture.etat === 'erreur') && (
                      <div className="ag-lu ag-lu-orange" role="status">
                        <Ic n="alerte" t={17} />
                        <span className="ag-lu-t"><b>{'L’annonce n’a pas pu être lue automatiquement'}</b><small>{lecture.etat === 'erreur' ? lecture.message : 'Ajoutez quelques photos et le prix ci-dessous, ou envoyez le lien tel quel : Alexandre l’ouvrira.'}</small></span>
                      </div>
                    )}
                  </div>

                  <div className="ag-ou"><span />{'ou, s’il n’est pas en ligne'}<span /></div>

                  <input ref={fichier} type="file" accept="image/*" multiple hidden onChange={e => { void ajouterPhotos(e.target.files); }} />
                  <input ref={fichierPdf} type="file" accept="application/pdf,.pdf" hidden onChange={e => { void ajouterPdf(e.target.files); }} />
                  {pdf && <CartePdf pdf={pdf} onRetirer={() => setPdf(null)} />}
                  {pdfErreur && !pdf && (
                    <div className="ag-erreur ag-erreur-pdf" role="alert"><Ic n="alerte" t={17} /><span>{pdfErreur}</span>
                      <button type="button" className="ag-erreur-x" onClick={() => setPdfErreur(null)} aria-label="Fermer ce message"><Ic n="croix" t={14} /></button></div>
                  )}
                  {photos.length > 0 && (
                    <div className="ag-vigs">
                      {photos.map((p, i) => (
                        <span key={i} className="ag-vig">
                          <img src={p} alt={`Photo ${i + 1}`} />
                          <button type="button" aria-label={`Retirer la photo ${i + 1}`} onClick={() => setPhotos(l => l.filter((_, j) => j !== i))}><Ic n="croix" t={13} /></button>
                        </span>
                      ))}
                    </div>
                  )}
                  {(!pdf || photos.length < PHOTOS_MAX) && (
                    <div className="ag-ajouts">
                      {!pdf && (
                        <button type="button" className="ag-ajout" onClick={() => fichierPdf.current?.click()}>
                          <Ic n="pdf" t={19} /><span className="ag-ajout-t"><b>Déposer un PDF</b><small>Plaquette, fiche du bien</small></span>
                        </button>
                      )}
                      {photos.length < PHOTOS_MAX && (
                        <button type="button" className="ag-ajout" onClick={() => fichier.current?.click()}>
                          <Ic n="photo" t={19} /><span className="ag-ajout-t"><b>{photos.length ? 'Ajouter d’autres photos' : 'Ajouter des photos'}</b><small>{`${PHOTOS_MAX} au maximum`}</small></span>
                        </button>
                      )}
                    </div>
                  )}
                  <div className="ag-grille">
                    <div className="ag-champ ag-large"><label htmlFor="ag-adr">Adresse <i>(facultatif)</i></label>
                      <Saisie n="lieu"><input id="ag-adr" value={adresse} onChange={e => setAdresse(e.target.value)} placeholder="12 rue Jean-Jaurès, Vanves" maxLength={300} /></Saisie></div>
                    <div className="ag-champ"><label htmlFor="ag-prix">Prix</label>
                      <Saisie n="budget"><input id="ag-prix" inputMode="numeric" value={prix} onChange={e => setPrix(e.target.value)} placeholder="265 000 €" maxLength={20} /></Saisie></div>
                    <div className="ag-champ"><label htmlFor="ag-surf">Surface</label>
                      <Saisie n="surface"><input id="ag-surf" inputMode="decimal" value={surface} onChange={e => setSurface(e.target.value)} placeholder="52 m²" maxLength={12} /></Saisie></div>
                  </div>
                  <div className="ag-champ"><label htmlFor="ag-mot">Un mot pour Alexandre <i>(facultatif)</i></label>
                    <Saisie n="bulle" haut><textarea id="ag-mot" rows={3} value={mot} onChange={e => setMot(e.target.value)} maxLength={1200}
                      placeholder="Exclusivité, pas encore en ligne. Visite possible jeudi après-midi." /></Saisie></div>
                </section>

                {vousVue !== 'form' && vousComplet(vous) ? (
                  <CarteVous vous={vous} repris={vousVue === 'repris'} onModifier={() => setVousVue('form')} />
                ) : (
                <section className="ag-carte ag-carte-vous" aria-label="Vous">
                  <TitreCarte n="personne">Vous</TitreCarte>
                  <div className="ag-champ"><label htmlFor="ag-agence">Agence</label>
                    <Saisie n="immeuble"><input id="ag-agence" autoComplete="organization" value={vous.agence} onChange={e => setVous(v => ({ ...v, agence: e.target.value }))} maxLength={120} placeholder="Agence du Parc" /></Saisie></div>
                  <div className="ag-grille">
                    <div className="ag-champ"><label htmlFor="ag-nom">Votre nom</label>
                      <Saisie n="personne"><input id="ag-nom" autoComplete="name" value={vous.interlocuteur} onChange={e => setVous(v => ({ ...v, interlocuteur: e.target.value }))} maxLength={120} placeholder="Julien Martin" /></Saisie></div>
                    <div className="ag-champ"><label htmlFor="ag-tel">Téléphone</label>
                      <Saisie n="tel"><input id="ag-tel" type="tel" autoComplete="tel" value={vous.tel} onChange={e => setVous(v => ({ ...v, tel: e.target.value }))} maxLength={40} placeholder="06 12 34 56 78" /></Saisie></div>
                    <div className="ag-champ ag-large-m"><label htmlFor="ag-mail">E-mail <i>(facultatif)</i></label>
                      <Saisie n="mail"><input id="ag-mail" type="email" autoComplete="email" value={vous.email} onChange={e => setVous(v => ({ ...v, email: e.target.value }))} maxLength={160} placeholder="julien@agence.fr" /></Saisie></div>
                  </div>
                  <span className="ag-aide ag-aide-ic"><Ic n="cadenas" t={14} /><span>{'Gardé sur cet appareil : la prochaine fois, c’est déjà rempli.'}</span></span>
                </section>
                )}

                {erreur && <div className="ag-erreur" role="alert"><Ic n="alerte" t={17} /><span>{erreur}</span></div>}
                <button type="button" className="ag-btn ag-btn-or" onClick={() => { void envoyer(); }} disabled={envoi || lecture.etat === 'lecture' || pdf?.etat === 'lecture'}>
                  {envoi ? <span className="ag-rond ag-rond-fonce" aria-hidden="true" /> : <Ic n="fleche" t={18} />}
                  <span>{envoi ? (etape === 'pdf' ? 'Envoi du PDF…' : 'Envoi…') : lecture.etat === 'lecture' ? 'Lecture de l’annonce…' : pdf?.etat === 'lecture' ? 'Lecture du PDF…' : 'Envoyer à Alexandre'}</span>
                </button>
                <a className="ag-appel ag-mob" href={`tel:${TEL_URL}`}><Ic n="tel" t={15} /><span>{`Une question ? ${TEL}`}</span></a>
                {envoyes.length > 0 && <CarteEnvois envoyes={envoyes} />}
              </div>
            </div>
          </>
        )}
      </main>
    </>
  );
}

const CSS = `
html, body{ height:auto !important; min-height:100% !important; overflow-x:hidden !important; overflow-y:auto !important; -webkit-overflow-scrolling:touch }
body{ margin:0; background:#F5F8FC }
.ag-page{ min-height:100vh; background:#F5F8FC; color:#13243D; font-family:'Plus Jakarta Sans',system-ui,-apple-system,sans-serif; font-size:15px; line-height:1.5; padding-bottom:40px }
.ag-page *{ box-sizing:border-box }
.ag-tete{ position:relative; overflow:hidden; background:#22497D; color:#fff; padding:22px 20px 62px }
.ag-tete-in{ position:relative; z-index:1; max-width:1080px; margin:0 auto }
.ag-tete-g{ display:flex; flex-direction:column; gap:10px; min-width:0 }
.ag-tete-d{ display:none }
.ag-pc{ display:none !important }
.ag-marque{ display:flex; align-items:center; justify-content:space-between; gap:12px; font-size:11.5px; font-weight:800; letter-spacing:1.4px; color:#F2B266 }
.ag-marque-d{ letter-spacing:0; font-size:12px; font-weight:600; color:#DCE6F3 }
.ag-moi{ display:flex; align-items:center; gap:12px; margin-top:4px }
.ag-av{ width:44px; height:44px; border-radius:50%; background:#fff; color:#22497D; display:inline-flex; align-items:center; justify-content:center; font-size:15px; font-weight:800; flex-shrink:0 }
.ag-moi-t{ display:flex; flex-direction:column; gap:1px }
.ag-moi-t b{ font-size:16px; font-weight:800 }
.ag-moi-t small{ font-size:13px; font-weight:600; color:#DCE6F3 }
.ag-tete h1{ margin:8px 0 0; font-size:24px; font-weight:800; line-height:1.25; letter-spacing:-.4px }
.ag-tete p{ margin:0; font-size:14.5px; font-weight:600; color:#DCE6F3; max-width:560px }
/* Au-dessus du bandeau (qui est positionné) : sinon il recouvre le haut des cartes. */
.ag-corps{ position:relative; z-index:2; max-width:1080px; margin:-42px auto 0; padding:0 16px; display:flex; flex-direction:column; gap:16px }
.ag-corps-un{ max-width:560px }
.ag-gauche, .ag-droite{ display:flex; flex-direction:column; gap:16px; min-width:0 }
.ag-carte{ background:#fff; border-radius:18px; border:1px solid #E3E9F2; padding:16px; display:flex; flex-direction:column; gap:13px; box-shadow:0 10px 30px -22px rgba(19,36,61,.45) }
.ag-carte h2{ margin:0; font-size:17px; font-weight:800 }
.ag-sur{ font-size:11.5px; font-weight:800; letter-spacing:1.2px; color:#5B6B80 }
.ag-puces{ display:flex; flex-wrap:wrap; gap:7px }
.ag-puce{ padding:6px 11px; border-radius:99px; background:#E8EFF8; color:#22497D; font-size:13px; font-weight:700 }
.ag-puce-or{ background:#FFF6EC; color:#A95808; font-weight:800; border:1px solid #F7D5B0 }
/* V3.202 — Les critères en tuiles à icône, « Important pour lui » et « Ses précisions » encadrés. */
.ag-tuiles{ display:flex; flex-direction:column; gap:8px }
.ag-tuile{ display:flex; align-items:center; gap:12px; padding:10px 12px; border-radius:14px; background:#fff; border:1px solid #E8EDF4; transition:border-color .2s ease, box-shadow .2s ease, transform .2s ease }
.ag-tuile:hover{ border-color:#C9D6E6; box-shadow:0 8px 20px -16px rgba(19,36,61,.5) }
.ag-tuile-ic{ width:40px; height:40px; border-radius:12px; background:#E8EFF8; color:#22497D; display:inline-flex; align-items:center; justify-content:center; flex-shrink:0 }
.ag-tuile[data-or] .ag-tuile-ic{ background:#FFF1E0; color:#A95808 }
.ag-tuile-t{ display:flex; flex-direction:column; gap:1px; min-width:0 }
.ag-tuile-t b{ font-size:14.5px; font-weight:800; line-height:1.3; color:#13243D }
.ag-tuile[data-or] .ag-tuile-t b{ color:#A95808 }
.ag-tuile-t small{ font-size:12.5px; font-weight:600; color:#6B7A90 }
.ag-boite{ display:flex; flex-direction:column; gap:9px; padding:13px 14px; border-radius:14px; background:#F5F8FC; border:1px solid #E3E9F2 }
.ag-boite-vert{ background:#F3FBF5; border-color:#D5F0DD }
.ag-boite-t{ display:flex; align-items:center; gap:8px; font-size:12px; font-weight:800; letter-spacing:.6px; color:#5B6B80 }
.ag-boite-t svg{ flex-shrink:0; color:#15803d }
.ag-boite-bleu svg{ color:#22497D }
.ag-imp-l{ display:flex; align-items:center; gap:9px; font-size:14px; font-weight:700 }
.ag-coche{ width:22px; height:22px; border-radius:50%; background:#DCFCE7; color:#15803d; display:inline-flex; align-items:center; justify-content:center; flex-shrink:0 }
/* V3.202 — ses précisions, quand Alexandre les montre. */
.ag-prec{ margin:0; padding-left:12px; border-left:3px solid #E68B23; font-size:14px; font-weight:600; line-height:1.6; color:#13243D; white-space:pre-line; overflow-wrap:anywhere }
/* Le titre d'une carte, avec son icône ; une case avec son icône. */
.ag-titre-c{ display:flex; align-items:center; gap:10px; flex-wrap:wrap }
.ag-titre-ic{ width:34px; height:34px; border-radius:10px; background:#E8EFF8; color:#22497D; display:inline-flex; align-items:center; justify-content:center; flex-shrink:0 }
.ag-titre-c .ag-pastille{ margin-left:auto }
.ag-saisie{ position:relative }
.ag-saisie > svg{ position:absolute; left:13px; top:14.5px; color:#8592A6; pointer-events:none; transition:color .2s ease }
.ag-saisie[data-haut] > svg{ top:13px }
.ag-saisie:focus-within > svg{ color:#22497D }
.ag-champ .ag-saisie input, .ag-champ .ag-saisie textarea{ padding-left:40px }
.ag-aide-ic{ display:flex; align-items:center; gap:7px }
.ag-aide-ic svg{ flex-shrink:0 }
.ag-note{ margin:0; display:flex; align-items:center; gap:8px; font-size:12.5px; font-weight:600; color:#6B7A90; padding:0 4px }
.ag-note svg{ flex-shrink:0 }
.ag-champ{ display:flex; flex-direction:column; gap:6px; min-width:0 }
.ag-champ label{ font-size:13px; font-weight:700; color:#3D4C63 }
.ag-champ label i{ font-style:normal; font-weight:600; color:#8592A6 }
.ag-champ input, .ag-champ textarea{ width:100%; height:46px; border:1.5px solid #D5DEEA; border-radius:12px; padding:0 13px; font-family:inherit; font-size:15px; color:#13243D; background:#F8FAFC; outline:none; transition:border-color .2s ease, background .2s ease, box-shadow .2s ease }
.ag-champ textarea{ height:auto; padding:10px 13px; line-height:1.5; resize:vertical; min-height:84px }
.ag-champ input:focus, .ag-champ textarea:focus{ border-color:#22497D; background:#fff; box-shadow:0 0 0 3px rgba(34,73,125,.12) }
.ag-aide{ font-size:12.5px; font-weight:600; line-height:1.45; color:#6B7A90 }
.ag-lu{ display:flex; align-items:center; gap:10px; padding:10px; border-radius:13px; background:#f0fdf4; border:1px solid #bbf7d0 }
.ag-lu-neutre{ background:#F5F8FC; border-color:#E3E9F2; width:100% }
.ag-lu-attente{ background:#F5F8FC; border-color:#E3E9F2 }
.ag-lu-orange{ background:#FFF6EC; border-color:#F7D5B0; color:#A95808; align-items:flex-start }
.ag-lu-orange svg{ flex-shrink:0; margin-top:2px }
.ag-lu-ph{ width:58px; height:46px; border-radius:9px; background:#D2DCEA; flex-shrink:0; object-fit:cover; display:block }
.ag-lu-t{ display:flex; flex-direction:column; gap:2px; min-width:0 }
.ag-lu-t b{ font-size:14px; font-weight:800; color:#13243D }
.ag-lu-t small{ font-size:12.5px; font-weight:600; color:#5B6B80; line-height:1.4 }
.ag-lu-orange .ag-lu-t b{ color:#A95808 }
.ag-lu-ok{ display:flex; align-items:center; gap:6px; font-size:12px; font-weight:800; color:#15803d }
.ag-rond{ width:22px; height:22px; border-radius:50%; border:3px solid #DCE3EC; border-top-color:#22497D; animation:ag-tourne .8s linear infinite; flex-shrink:0 }
.ag-rond-fonce{ width:18px; height:18px; border-color:rgba(19,36,61,.25); border-top-color:#13243D }
@keyframes ag-tourne{ to{ transform:rotate(360deg) } }
@media (prefers-reduced-motion: reduce){ .ag-rond{ animation-duration:2.4s } }
.ag-ou{ display:flex; align-items:center; gap:10px; color:#8592A6; font-size:12.5px; font-weight:700 }
.ag-ou span{ flex-grow:1; height:1px; background:#E3E9F2 }
.ag-ajout{ min-height:54px; border-radius:12px; border:1.5px dashed #B7C3D4; background:#fff; color:#22497D; font-family:inherit; font-size:14px; font-weight:800; display:inline-flex; flex-direction:column; align-items:center; justify-content:center; gap:4px; padding:8px 10px; cursor:pointer }
.ag-ajout:hover{ border-color:#22497D; background:#F8FAFD }
.ag-ajout svg{ flex-shrink:0 }
/* V3.202 — le PDF et les photos, côte à côte. */
.ag-ajouts{ display:flex; gap:10px }
.ag-ajouts > .ag-ajout{ flex:1 1 0; min-width:0 }
.ag-ajout-t{ display:flex; flex-direction:column; align-items:center; gap:1px; min-width:0; text-align:center }
.ag-ajout-t b{ font-size:14px; font-weight:800; line-height:1.25 }
.ag-ajout-t small{ display:none; font-size:12px; font-weight:600; color:#5B6B80 }
.ag-pdf{ align-items:center }
.ag-pdf-ph{ width:46px; height:62px; border-radius:6px; background:#fff; border:1px solid #D5DEEA; object-fit:cover; object-position:top; display:block; flex-shrink:0; box-shadow:0 4px 10px -6px rgba(19,36,61,.4) }
.ag-pdf-ph-vide{ display:inline-flex; align-items:center; justify-content:center; color:#8592A6 }
.ag-pdf .ag-lu-t{ flex:1 1 auto }
.ag-pdf-nom{ overflow:hidden; text-overflow:ellipsis; white-space:nowrap }
.ag-pdf-x{ width:40px; height:40px; border-radius:10px; border:1px solid #D5DEEA; background:#fff; color:#3D4C63; display:inline-flex; align-items:center; justify-content:center; flex-shrink:0; cursor:pointer; padding:0 }
.ag-pdf-x:hover{ border-color:#b91c1c; color:#b91c1c }
.ag-pdf-recu{ flex-direction:column; align-items:stretch; background:#EEF3FA; border-color:#D5DEEA }
.ag-pdf-haut{ display:flex; align-items:center; gap:10px; min-width:0 }
.ag-pdf-aide{ font-size:12.5px; font-weight:600; line-height:1.45; color:#3D4C63 }
.ag-lu-bleu{ color:#22497D }
/* V3.202 — « Bonjour Julie, » et « Vous » déjà rempli. */
.ag-salut{ display:block; margin-top:8px; font-size:16px; font-weight:800; color:#F2B266 }
.ag-salut + h1{ margin-top:2px }
.ag-vous-tete{ display:flex; align-items:center; justify-content:space-between; gap:10px; flex-wrap:wrap }
.ag-pastille{ padding:4px 10px; border-radius:99px; background:#E8EFF8; color:#22497D; font-size:12px; font-weight:700 }
.ag-vous{ display:flex; align-items:center; gap:12px; padding:12px; border-radius:14px; background:#F8FAFC; border:1px solid #E3E9F2 }
.ag-av-plein{ background:#22497D; color:#fff; width:46px; height:46px; font-size:15px }
.ag-vous-t{ flex:1 1 auto; display:flex; flex-direction:column; gap:3px; min-width:0 }
.ag-vous-t b{ font-size:15px; font-weight:800 }
.ag-vous-ls{ display:flex; flex-wrap:wrap; column-gap:14px; row-gap:3px }
.ag-vous-l{ display:inline-flex; align-items:center; gap:6px; min-width:0; font-size:13px; font-weight:600; color:#5B6B80 }
.ag-vous-t > .ag-vous-l{ font-weight:700; color:#3D4C63 }
.ag-vous-l svg{ flex-shrink:0; color:#8592A6 }
.ag-vous-l span{ overflow-wrap:anywhere }
.ag-modif{ height:44px; padding:0 13px; border-radius:11px; border:1.5px solid #D5DEEA; background:#fff; color:#22497D; font-family:inherit; font-size:13.5px; font-weight:800; display:inline-flex; align-items:center; gap:7px; flex-shrink:0; cursor:pointer }
.ag-modif:hover{ border-color:#22497D }
.ag-vigs{ display:flex; flex-wrap:wrap; gap:8px }
.ag-vig{ position:relative; width:78px; height:62px; border-radius:10px; overflow:hidden; background:#D2DCEA }
.ag-vig img{ width:100%; height:100%; object-fit:cover; display:block }
.ag-vig button{ position:absolute; top:4px; right:4px; width:24px; height:24px; border-radius:50%; border:none; background:rgba(19,36,61,.75); color:#fff; display:flex; align-items:center; justify-content:center; cursor:pointer; padding:0 }
.ag-grille{ display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:10px }
.ag-large, .ag-large-m{ grid-column:span 2 }
.ag-erreur{ display:flex; align-items:flex-start; gap:9px; padding:12px 14px; border-radius:13px; background:#fef2f2; border:1px solid #fecaca; color:#b91c1c; font-size:14px; font-weight:700 }
.ag-erreur svg{ flex-shrink:0; margin-top:2px }
.ag-erreur > span{ flex:1 1 auto }
.ag-erreur-x{ width:28px; height:28px; margin:-4px -6px -4px 0; border:none; border-radius:8px; background:transparent; color:#b91c1c; display:inline-flex; align-items:center; justify-content:center; flex-shrink:0; cursor:pointer; padding:0 }
.ag-erreur-x:hover{ background:#fee2e2 }
.ag-erreur-x svg{ margin-top:0 }
.ag-btn{ height:54px; border-radius:15px; border:none; font-family:inherit; font-size:16px; font-weight:800; display:inline-flex; align-items:center; justify-content:center; gap:9px; text-decoration:none; cursor:pointer; width:100% }
.ag-btn:disabled{ opacity:.7; cursor:default }
.ag-btn-or{ background:#E68B23; color:#13243D }
.ag-btn-or:hover:not(:disabled){ background:#F09A35 }
.ag-btn-bleu{ background:#22497D; color:#fff }
.ag-btn-blanc{ background:#fff; color:#13243D; border:1px solid #DCE3EC; height:50px; font-size:15px }
.ag-appel{ align-self:center; display:inline-flex; align-items:center; gap:7px; font-size:13.5px; font-weight:700; color:#5B6B80; text-decoration:none; padding:6px 10px }
.ag-fait{ align-items:center; text-align:center; padding:22px 18px }
.ag-fait-ic{ width:64px; height:64px; border-radius:50%; background:#f0fdf4; border:1px solid #bbf7d0; color:#15803d; display:inline-flex; align-items:center; justify-content:center }
.ag-fait .ag-lu{ text-align:left }
.ag-hist-l{ display:flex; justify-content:space-between; gap:12px; font-size:13.5px; font-weight:700 }
.ag-recap{ gap:14px }
.ag-recap-haut{ display:flex; align-items:center; gap:12px }
.ag-recap-haut .ag-fait-ic{ width:48px; height:48px; flex-shrink:0 }
.ag-recap-t{ display:flex; flex-direction:column; gap:1px }
.ag-recap-t b{ font-size:17px; font-weight:800 }
.ag-recap-t small{ font-size:13px; font-weight:600; color:#5B6B80 }
.ag-recap-bien{ display:flex; align-items:center; gap:12px; padding:10px; border-radius:14px; background:#F5F8FC; border:1px solid #E3E9F2 }
.ag-recap-ph{ width:84px; height:64px; border-radius:10px; background:#D2DCEA; object-fit:cover; display:block; flex-shrink:0 }
.ag-recap-act{ display:flex; flex-direction:column; gap:10px }
.ag-contact{ flex-direction:row; align-items:center; gap:12px }
.ag-av-bleu{ background:#22497D; color:#fff; width:42px; height:42px; font-size:14px }
.ag-contact-t{ flex:1 1 auto; display:flex; flex-direction:column; gap:1px; min-width:0 }
.ag-contact-t b{ font-size:14.5px; font-weight:800 }
.ag-contact-t small{ font-size:13px; font-weight:600; color:#5B6B80 }
.ag-contact-t .ag-tel{ white-space:nowrap; color:#22497D; font-weight:800 }
.ag-contact-b{ width:44px; height:44px; border-radius:12px; background:#FFF6EC; border:1px solid #F7D5B0; color:#A95808; display:inline-flex; align-items:center; justify-content:center; flex-shrink:0 }
.ag-contact-b:hover{ background:#FDEBD5 }
.ag-etapes{ background:rgba(255,255,255,.07); border:1px solid rgba(255,255,255,.16); border-radius:20px; padding:18px 20px; -webkit-backdrop-filter:blur(4px); backdrop-filter:blur(4px) }
.ag-etapes-t{ display:block; font-size:11.5px; font-weight:800; letter-spacing:1.3px; text-transform:uppercase; color:#F2B266; margin-bottom:12px }
.ag-etapes ol{ list-style:none; margin:0; padding:0; display:flex; flex-direction:column; gap:13px }
.ag-etapes li{ display:flex; align-items:flex-start; gap:12px }
.ag-etapes-n{ width:30px; height:30px; border-radius:50%; flex-shrink:0; display:inline-flex; align-items:center; justify-content:center; background:#E68B23; color:#13243D; font-size:14px; font-weight:800 }
.ag-etapes li[data-fait] .ag-etapes-n{ background:#22c55e; color:#fff }
.ag-etapes-x{ display:flex; flex-direction:column; gap:1px; padding-top:3px }
.ag-etapes-x b{ font-size:14.5px; font-weight:800; color:#fff }
.ag-etapes-x small{ font-size:13px; font-weight:600; color:#C9D6EA; line-height:1.45 }
.ag-hist-l small{ font-size:13px; font-weight:600; color:#6B7A90; white-space:nowrap }
/* V3.198 — le « ? » de « Vos envois pour ce client », et sa bulle. */
.ag-hist-tete{ position:relative; display:flex; align-items:flex-start; gap:10px }
.ag-hist-titre{ flex:1 1 auto; display:flex; flex-direction:column; gap:2px; min-width:0 }
.ag-hist-sous{ font-size:12.5px; font-weight:600; color:#6B7A90 }
.ag-q{ position:relative; width:28px; height:28px; border-radius:50%; border:1.5px solid #B7C3D4; background:#fff; color:#22497D; font-family:inherit; font-size:14px; font-weight:800; display:inline-flex; align-items:center; justify-content:center; padding:0; cursor:pointer; flex-shrink:0 }
.ag-q::after{ content:''; position:absolute; inset:-9px }
.ag-q:hover, .ag-q[aria-expanded="true"]{ border-color:#22497D; background:#E8EFF8 }
.ag-bulle{ position:absolute; z-index:5; top:calc(100% + 10px); right:-4px; width:min(330px, calc(100vw - 48px)); box-sizing:border-box; background:#13243D; color:#fff; border-radius:14px; padding:13px 15px; display:flex; flex-direction:column; gap:6px; box-shadow:0 18px 40px -14px rgba(19,36,61,.65); font-size:13.5px; line-height:1.5 }
.ag-bulle::before{ content:''; position:absolute; top:-6px; right:13px; width:12px; height:12px; background:#13243D; transform:rotate(45deg); border-radius:2px }
.ag-bulle b{ font-size:14px; font-weight:800 }
.ag-bulle span{ color:#DCE6F3; font-weight:600 }
.ag-bulle button{ align-self:flex-start; margin-top:4px; height:36px; padding:0 14px; border-radius:10px; border:none; background:#E68B23; color:#13243D; font-family:inherit; font-size:13.5px; font-weight:800; cursor:pointer }
@media (min-width: 900px){
  .ag-pc{ display:flex !important }
  .ag-mob{ display:none !important }
  .ag-tete{ padding:34px 32px 84px }
  /* Un léger motif de points à droite, et deux cercles fins, orange pâle. */
  .ag-tete::before{ content:''; position:absolute; inset:0; pointer-events:none;
    background-image:radial-gradient(rgba(255,255,255,.10) 1.2px, transparent 1.4px); background-size:22px 22px;
    -webkit-mask-image:linear-gradient(90deg, transparent 35%, #000 80%); mask-image:linear-gradient(90deg, transparent 35%, #000 80%) }
  .ag-tete::after{ content:''; position:absolute; right:-230px; top:-260px; width:460px; height:460px; border-radius:50%; pointer-events:none;
    border:1px solid rgba(242,178,102,.28); box-shadow:0 0 0 70px rgba(255,255,255,.025), 0 0 0 71px rgba(242,178,102,.14) }
  .ag-tete-in{ display:grid; grid-template-columns:minmax(0,1fr) minmax(0,400px); gap:56px; align-items:center }
  .ag-tete-d{ display:block }
  .ag-tete h1{ font-size:34px; letter-spacing:-.6px }
  .ag-tete p{ font-size:15.5px }
  .ag-corps.ag-corps-fait{ grid-template-columns:minmax(0,1.2fr) minmax(0,1fr) }
  .ag-marque{ justify-content:flex-start; gap:12px }
  .ag-marque-d{ padding:4px 10px; border-radius:99px; background:rgba(255,255,255,.1); border:1px solid rgba(255,255,255,.18) }
  .ag-recap{ padding:22px }
  .ag-recap-ph{ width:150px; height:110px; border-radius:12px }
  .ag-recap-bien{ padding:12px; gap:16px }
  .ag-recap-bien .ag-lu-t b{ font-size:17px }
  .ag-recap-bien .ag-lu-t small{ font-size:13.5px }
  .ag-recap-act{ flex-direction:row }
  .ag-recap-act .ag-btn{ flex:1 1 0; height:52px; font-size:15px }
  .ag-corps{ display:grid; grid-template-columns:minmax(0,360px) minmax(0,1fr); align-items:start; gap:22px; padding:0 32px; margin-top:-48px; max-width:1144px }
  .ag-corps-un{ display:flex; flex-direction:column; max-width:1144px }
  .ag-corps-un > *{ width:100%; max-width:560px }
  .ag-gauche{ position:sticky; top:20px }
  .ag-carte{ padding:20px }
  .ag-grille{ grid-template-columns:repeat(3,minmax(0,1fr)) }
  .ag-large{ grid-column:span 3 }
  .ag-large-m{ grid-column:auto }
  .ag-droite > .ag-btn{ align-self:flex-end; width:auto; padding:0 34px }
  .ag-droite > .ag-appel{ align-self:flex-end }
  .ag-ajout{ flex-direction:row; gap:10px; min-height:58px }
  .ag-ajout-t{ align-items:flex-start; text-align:left }
  .ag-ajout-t small{ display:block }
  .ag-salut{ font-size:19px; margin-top:10px }
}
@media (max-width: 899px){
  /* Sur un téléphone, « Vous » une case par ligne : avec l'icône, deux côte à côte coupent le numéro. */
  .ag-carte-vous .ag-grille{ grid-template-columns:minmax(0,1fr) }
  .ag-carte-vous .ag-large-m{ grid-column:auto }
}
@media (max-width: 420px){
  .ag-modif span{ display:none }
  .ag-modif{ width:44px; padding:0; justify-content:center }
}
/* V3.202 — Des transitions douces : les cartes montent l'une après l'autre,
   ce qui vient d'être lu apparaît en fondu, les boutons répondent au doigt. */
@keyframes ag-monte{ from{ opacity:0; transform:translateY(12px) } to{ opacity:1; transform:none } }
@keyframes ag-fondu{ from{ opacity:0; transform:translateY(-4px) scale(.985) } to{ opacity:1; transform:none } }
@keyframes ag-pop{ from{ opacity:0; transform:scale(.9) } to{ opacity:1; transform:none } }
.ag-corps > .ag-gauche > *, .ag-corps > .ag-droite > *, .ag-corps-fait > *{ animation:ag-monte .42s cubic-bezier(.2,.8,.2,1) both }
.ag-corps > .ag-gauche > :nth-child(2), .ag-corps > .ag-droite > :nth-child(2){ animation-delay:.06s }
.ag-corps > .ag-gauche > :nth-child(3), .ag-corps > .ag-droite > :nth-child(3){ animation-delay:.12s }
.ag-corps > .ag-droite > :nth-child(n+4){ animation-delay:.16s }
.ag-tete-g, .ag-tete-d{ animation:ag-monte .5s cubic-bezier(.2,.8,.2,1) both }
.ag-tete-d{ animation-delay:.08s }
.ag-lu, .ag-erreur, .ag-vig, .ag-bulle{ animation:ag-fondu .28s ease both }
.ag-vig{ animation-name:ag-pop }
.ag-fait-ic{ animation:ag-pop .4s cubic-bezier(.2,.9,.3,1.3) both .1s }
.ag-btn, .ag-ajout, .ag-modif, .ag-pdf-x, .ag-contact-b, .ag-q{ transition:transform .14s ease, background .2s ease, border-color .2s ease, box-shadow .2s ease, opacity .2s ease }
.ag-btn:active:not(:disabled), .ag-ajout:active, .ag-modif:active, .ag-pdf-x:active, .ag-contact-b:active{ transform:scale(.97) }
.ag-btn-or{ box-shadow:0 10px 22px -12px rgba(230,139,35,.9) }
.ag-btn-or:hover:not(:disabled){ box-shadow:0 14px 26px -12px rgba(230,139,35,.95) }
.ag-carte{ transition:box-shadow .25s ease }
@media (prefers-reduced-motion: reduce){
  .ag-page *:not(.ag-rond), .ag-page *::before, .ag-page *::after{ animation-duration:.01ms !important; animation-delay:0s !important; transition-duration:.01ms !important }
}
`;
