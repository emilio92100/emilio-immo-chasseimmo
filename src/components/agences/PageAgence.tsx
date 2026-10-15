'use client';
import { useEffect, useRef, useState } from 'react';
import type { ResumeAgence } from '@/lib/agences-lien';

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
 */

type Apercu = { titre: string | null; prix: number | null; surface: number | null; pieces: number | null; chambres: number | null; etage: number | null; ville: string | null; balcon: boolean; terrasse: boolean; jardin: boolean; photos: number; photo: string | null };
type Lecture =
  | { etat: 'vide' }
  | { etat: 'lecture'; url: string }
  | { etat: 'ok' | 'partielle'; url: string; apercu: Apercu; fiche: unknown; signature: string }
  | { etat: 'echec'; url: string }
  | { etat: 'erreur'; url: string; message: string };
type Envoye = { titre: string; prix: number | null; le: string };

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
  vide: 'Collez le lien de l’annonce, ou ajoutez au moins une photo.',
  agence: 'Indiquez le nom de votre agence.',
  contact: 'Indiquez un téléphone ou un e-mail, pour qu’Alexandre puisse vous rappeler.',
  trop: 'Beaucoup d’envois d’un coup : réessayez dans quelques minutes.',
  ferme: 'Cette recherche n’est plus ouverte.',
  lien: 'Ce lien n’est plus valable.',
  indisponible: 'L’envoi n’est pas encore ouvert : appelez Alexandre, il s’en occupe.',
};

/* ── Les icônes, dessinées ── */
function Ic({ n, t = 18 }: { n: 'coche' | 'fleche' | 'plus' | 'tel' | 'photo' | 'lien' | 'croix' | 'alerte' | 'cadenas'; t?: number }) {
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
  };
  return <svg width={t} height={t} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{p[n]}</svg>;
}

/* V3.197 — Alexandre : « sur PC, le bandeau, c'est que du bleu ; plus
   moderne, avec des choses à droite, à gauche ». À droite (ordinateur
   seulement) : les étapes, sur un léger motif. */
function Entete({ titre, sous, cote }: { titre: string; sous: string; cote?: React.ReactNode }) {
  return (
    <header className="ag-tete">
      <div className="ag-tete-in">
        <div className="ag-tete-g">
          <div className="ag-marque"><span>EMILIO IMMOBILIER</span><span className="ag-marque-d">Recherche pour un acquéreur</span></div>
          <div className="ag-moi">
            <span className="ag-av" aria-hidden="true">AR</span>
            <span className="ag-moi-t"><b>Alexandre Rogelet</b><small>Emilio Immobilier · Vanves</small></span>
          </div>
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
  { t: 'Collez le lien de votre annonce', s: 'Votre site, SeLoger, Leboncoin… ou quelques photos.' },
  { t: 'Elle est lue automatiquement', s: 'Photos, prix, surface : rien à ressaisir.' },
  { t: 'Alexandre vous rappelle', s: 'Si le bien correspond à son client.' },
];
const ETAPES_FAIT = [
  { t: 'Votre bien est arrivé', s: 'Chez Alexandre, avec vos coordonnées.', fait: true },
  { t: 'Il l’étudie pour son client', s: 'Il le compare à sa recherche.' },
  { t: 'Il revient vers vous', s: 'S’il intéresse son client, pour organiser une visite.' },
];

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

function CarteRecherche({ resume }: { resume: ResumeAgence }) {
  return (
    <section className="ag-carte ag-rech" aria-label="Ce que cherche mon client">
      <span className="ag-sur">CE QUE CHERCHE MON CLIENT</span>
      <div className="ag-puces">
        {resume.puces.map(p => <span key={p} className="ag-puce">{p}</span>)}
        {resume.budget && <span className="ag-puce ag-puce-or">{resume.budget}</span>}
      </div>
      {resume.important.length > 0 && (
        <div className="ag-imp">
          <span className="ag-imp-t">Important pour lui</span>
          {resume.important.map(x => <span key={x} className="ag-imp-l"><Ic n="coche" t={16} /><span>{x}</span></span>)}
        </div>
      )}
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

export default function PageAgence({ etat, token, resume }: { etat: 'ouvert' | 'ferme' | 'inconnu'; token?: string; resume?: ResumeAgence }) {
  const [lien, setLien] = useState('');
  const [lecture, setLecture] = useState<Lecture>({ etat: 'vide' });
  const [photos, setPhotos] = useState<string[]>([]);
  const [adresse, setAdresse] = useState('');
  const [prix, setPrix] = useState('');
  const [surface, setSurface] = useState('');
  const [mot, setMot] = useState('');
  const [vous, setVous] = useState({ agence: '', interlocuteur: '', tel: '', email: '' });
  const [envoi, setEnvoi] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const [fait, setFait] = useState<{ apercu: Apercu | null; deja?: boolean } | null>(null);
  const [envoyes, setEnvoyes] = useState<Envoye[]>([]);
  const fichier = useRef<HTMLInputElement>(null);
  const derniereLue = useRef('');

  useEffect(() => {
    setVous(v => ({ ...v, ...lireLocal(CLE_VOUS, {}) }));
    if (token) setEnvoyes(lireLocal<Envoye[]>(cleEnvois(token), []));
  }, [token]);

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

  async function envoyer() {
    if (envoi || !token) return;
    setErreur(null);
    const u = lien.trim();
    if (!u && !photos.length) { setErreur(ERREURS.vide); return; }
    if (!vous.agence.trim()) { setErreur(ERREURS.agence); return; }
    if (!vous.tel.trim() && !vous.email.trim()) { setErreur(ERREURS.contact); return; }
    setEnvoi(true);
    ecrireLocal(CLE_VOUS, vous);
    const lu = (lecture.etat === 'ok' || lecture.etat === 'partielle') && lecture.url === u ? lecture : null;
    try {
      const r = await fetch('/api/agences/proposer', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          token, url: u || null, fiche: lu?.fiche || null, signature: lu?.signature || null,
          photos, adresse, prix, surface, mot, ...vous,
        }),
      });
      const d = await r.json().catch(() => null) as { ok?: boolean; deja?: boolean; apercu?: Apercu; error?: string } | null;
      if (!r.ok || !d?.ok) { setErreur(ERREURS[d?.error || ''] || 'L’envoi n’est pas passé. Réessayez dans un instant.'); return; }
      if (d.deja) { setFait({ apercu: lu?.apercu || null, deja: true }); return; }
      const a = d.apercu || lu?.apercu || null;
      const nouveau: Envoye = { titre: a ? ligneApercu(a) : (u ? 'Votre annonce' : 'Vos photos'), prix: a?.prix || null, le: new Date().toISOString() };
      const l = [nouveau, ...envoyes].slice(0, 12);
      setEnvoyes(l); ecrireLocal(cleEnvois(token), l);
      setFait({ apercu: a });
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch {
      setErreur('L’envoi n’est pas passé. Vérifiez votre connexion et réessayez.');
    } finally {
      setEnvoi(false);
    }
  }

  function autre() {
    setFait(null); setLien(''); setLecture({ etat: 'vide' }); derniereLue.current = '';
    setPhotos([]); setAdresse(''); setPrix(''); setSurface(''); setMot(''); setErreur(null);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  if (etat !== 'ouvert' || !token || !resume) {
    return <><style>{CSS}</style><Fermee inconnu={etat === 'inconnu'} /></>;
  }

  const prenomAgent = vous.interlocuteur.trim().split(/\s+/)[0] || '';
  const quand = (iso: string) => {
    const d = new Date(iso); const auj = new Date();
    if (d.toDateString() === auj.toDateString()) return 'Aujourd’hui';
    return `Le ${d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' })}`;
  };

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
                {envoyes.length > 0 && (
                  <section className="ag-carte ag-hist" aria-label="Vos biens envoyés pour ce client">
                    <span className="ag-sur">VOS BIENS ENVOYÉS POUR CE CLIENT</span>
                    {envoyes.map((e, i) => <span key={i} className="ag-hist-l"><span>{e.titre}</span><small>{quand(e.le)}</small></span>)}
                  </section>
                )}
                <CarteContact />
              </div>
            </div>
          </>
        ) : (
          <>
            <Entete titre="Un bien pour mon client ?" sous="Déposez-le ici : il arrive directement chez moi. Je l’étudie et je reviens vers vous."
              cote={<Etapes titre="Comment ça marche" etapes={ETAPES_FORM} />} />
            <div className="ag-corps">
              <div className="ag-gauche">
                <CarteRecherche resume={resume} />
                <CarteContact />
                <p className="ag-note"><Ic n="cadenas" t={14} /><span>Vos coordonnées servent seulement à vous rappeler pour ce bien.</span></p>
              </div>

              <div className="ag-droite">
                <section className="ag-carte" aria-label="Votre bien">
                  <h2>Votre bien</h2>
                  <div className="ag-champ">
                    <label htmlFor="ag-lien">Le lien de l’annonce</label>
                    <span className="ag-aide">{'Celui de votre site d’agence, de SeLoger, de Leboncoin ou de tout autre site : collez-le, tout est repris automatiquement, photos comprises.'}</span>
                    <input id="ag-lien" type="url" inputMode="url" autoComplete="off" placeholder="https://…" value={lien}
                      onChange={e => { setLien(e.target.value); if (!e.target.value.trim()) { setLecture({ etat: 'vide' }); derniereLue.current = ''; } }}
                      onBlur={() => { const u = lien.trim(); if (u && u !== derniereLue.current) void lire(u); }} />
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
                  {photos.length < PHOTOS_MAX && (
                    <button type="button" className="ag-ajout" onClick={() => fichier.current?.click()}><Ic n="photo" t={17} /><span>{photos.length ? 'Ajouter d’autres photos' : 'Ajouter des photos'}</span></button>
                  )}
                  <div className="ag-grille">
                    <div className="ag-champ ag-large"><label htmlFor="ag-adr">Adresse</label>
                      <input id="ag-adr" value={adresse} onChange={e => setAdresse(e.target.value)} placeholder="12 rue Jean-Jaurès, Vanves" maxLength={300} /></div>
                    <div className="ag-champ"><label htmlFor="ag-prix">Prix</label>
                      <input id="ag-prix" inputMode="numeric" value={prix} onChange={e => setPrix(e.target.value)} placeholder="265 000 €" maxLength={20} /></div>
                    <div className="ag-champ"><label htmlFor="ag-surf">Surface</label>
                      <input id="ag-surf" inputMode="decimal" value={surface} onChange={e => setSurface(e.target.value)} placeholder="52 m²" maxLength={12} /></div>
                  </div>
                  <div className="ag-champ"><label htmlFor="ag-mot">Un mot pour Alexandre <i>(facultatif)</i></label>
                    <textarea id="ag-mot" rows={3} value={mot} onChange={e => setMot(e.target.value)} maxLength={1200}
                      placeholder="Exclusivité, pas encore en ligne. Visite possible jeudi après-midi." /></div>
                </section>

                <section className="ag-carte" aria-label="Vous">
                  <h2>Vous</h2>
                  <div className="ag-champ"><label htmlFor="ag-agence">Agence</label>
                    <input id="ag-agence" autoComplete="organization" value={vous.agence} onChange={e => setVous(v => ({ ...v, agence: e.target.value }))} maxLength={120} /></div>
                  <div className="ag-grille">
                    <div className="ag-champ"><label htmlFor="ag-nom">Votre nom</label>
                      <input id="ag-nom" autoComplete="name" value={vous.interlocuteur} onChange={e => setVous(v => ({ ...v, interlocuteur: e.target.value }))} maxLength={120} /></div>
                    <div className="ag-champ"><label htmlFor="ag-tel">Téléphone</label>
                      <input id="ag-tel" type="tel" autoComplete="tel" value={vous.tel} onChange={e => setVous(v => ({ ...v, tel: e.target.value }))} maxLength={40} /></div>
                    <div className="ag-champ ag-large-m"><label htmlFor="ag-mail">E-mail <i>(facultatif)</i></label>
                      <input id="ag-mail" type="email" autoComplete="email" value={vous.email} onChange={e => setVous(v => ({ ...v, email: e.target.value }))} maxLength={160} /></div>
                  </div>
                  <span className="ag-aide">{'Gardé sur cet appareil : la prochaine fois, c’est déjà rempli.'}</span>
                </section>

                {erreur && <div className="ag-erreur" role="alert"><Ic n="alerte" t={17} /><span>{erreur}</span></div>}
                <button type="button" className="ag-btn ag-btn-or" onClick={() => { void envoyer(); }} disabled={envoi || lecture.etat === 'lecture'}>
                  {envoi ? <span className="ag-rond ag-rond-fonce" aria-hidden="true" /> : <Ic n="fleche" t={18} />}
                  <span>{envoi ? 'Envoi…' : lecture.etat === 'lecture' ? 'Lecture de l’annonce…' : 'Envoyer à Alexandre'}</span>
                </button>
                <a className="ag-appel ag-mob" href={`tel:${TEL_URL}`}><Ic n="tel" t={15} /><span>{`Une question ? ${TEL}`}</span></a>
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
.ag-imp{ display:flex; flex-direction:column; gap:6px; padding-top:10px; border-top:1px solid #EEF2F7 }
.ag-imp-t{ font-size:12.5px; font-weight:700; color:#5B6B80 }
.ag-imp-l{ display:flex; align-items:center; gap:8px; font-size:14px; font-weight:600 }
.ag-imp-l svg{ color:#15803d; flex-shrink:0 }
.ag-note{ margin:0; display:flex; align-items:center; gap:8px; font-size:12.5px; font-weight:600; color:#6B7A90; padding:0 4px }
.ag-note svg{ flex-shrink:0 }
.ag-champ{ display:flex; flex-direction:column; gap:6px; min-width:0 }
.ag-champ label{ font-size:13px; font-weight:700; color:#3D4C63 }
.ag-champ label i{ font-style:normal; font-weight:600; color:#8592A6 }
.ag-champ input, .ag-champ textarea{ width:100%; height:46px; border:1.5px solid #D5DEEA; border-radius:12px; padding:0 13px; font-family:inherit; font-size:15px; color:#13243D; background:#F8FAFC; outline:none }
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
.ag-ajout{ height:46px; border-radius:12px; border:1.5px dashed #B7C3D4; background:#fff; color:#22497D; font-family:inherit; font-size:14px; font-weight:800; display:inline-flex; align-items:center; justify-content:center; gap:8px; cursor:pointer }
.ag-ajout:hover{ border-color:#22497D }
.ag-vigs{ display:flex; flex-wrap:wrap; gap:8px }
.ag-vig{ position:relative; width:78px; height:62px; border-radius:10px; overflow:hidden; background:#D2DCEA }
.ag-vig img{ width:100%; height:100%; object-fit:cover; display:block }
.ag-vig button{ position:absolute; top:4px; right:4px; width:24px; height:24px; border-radius:50%; border:none; background:rgba(19,36,61,.75); color:#fff; display:flex; align-items:center; justify-content:center; cursor:pointer; padding:0 }
.ag-grille{ display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:10px }
.ag-large, .ag-large-m{ grid-column:span 2 }
.ag-erreur{ display:flex; align-items:flex-start; gap:9px; padding:12px 14px; border-radius:13px; background:#fef2f2; border:1px solid #fecaca; color:#b91c1c; font-size:14px; font-weight:700 }
.ag-erreur svg{ flex-shrink:0; margin-top:2px }
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
}
`;
