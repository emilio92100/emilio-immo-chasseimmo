'use client';
/* ═══ Le « Détail » d'un bien (V3.165) ════════════════════════════════════

   Ce qu'Alexandre a validé sur la maquette F : la même fenêtre sert à
   relire et à corriger ce que la veille a relevé. Un menu des parties à
   gauche (une rangée de pastilles au téléphone), des pictos, et TOUTES les
   informations du bien — avant, les charges, la taxe foncière, le séjour,
   l'extérieur, l'année, les lots ou le GES étaient enregistrés mais
   n'apparaissaient pas ici. Ce qui manque est signalé en orange (« à
   compléter »), partie par partie.

   La fenêtre ne fait que montrer et modifier le formulaire de la fiche
   (FicheClient : editBienForm) ; l'enregistrement reste `saveFicheBien`. */

import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Icone } from './ParcoursBien';
import s from './DetailBien.module.css';

type Form = Record<string, any>;

interface Props {
  form: Form;
  setForm: (maj: (f: Form) => Form) => void;
  saving: boolean;
  onFermer: () => void;
  onEnregistrer: () => void;
  onSupprimer: () => void;
  onReformuler: () => void;
  reformuling: boolean;
}

const vide = (v: any) => v === null || v === undefined || String(v).trim() === '';
const val = (v: any) => (v === null || v === undefined ? '' : v);
const nombre = (v: any) => { const n = parseFloat(String(v ?? '').replace(',', '.')); return isFinite(n) ? n : 0; };
const euros = (n: number) => `${Math.round(n).toLocaleString('fr-FR')} €`;

const TYPES = ['Appartement', 'Maison', 'Duplex', 'Loft', 'Studio', 'Villa', 'Terrain', 'Autre'];
const EXPOSITIONS = ['Nord', 'Sud', 'Est', 'Ouest', 'Sud-Est', 'Sud-Ouest', 'Nord-Est', 'Nord-Ouest', 'Est-Ouest'];
const ETATS = ['Neuf', 'Rénové', 'Bon état', 'Entretenu', 'À rafraîchir', 'À rénover'];
const CHAUFFAGES = ['Central', 'Individuel', 'Collectif', 'Électrique'];
const ENERGIES = ['Gaz', 'Électrique', 'Fioul', 'Pompe à chaleur', 'Bois', 'Solaire'];
const DPE_C: Record<string, [string, string]> = {
  A: ['#319834', '#fff'], B: ['#4ab84a', '#fff'], C: ['#a8d84a', '#1a2332'], D: ['#f7e017', '#1a2332'],
  E: ['#f5b912', '#1a2332'], F: ['#ee8235', '#fff'], G: ['#e2231a', '#fff'],
};
const GES_C: Record<string, [string, string]> = {
  A: ['#f6edfd', '#1a2332'], B: ['#e4c7fa', '#1a2332'], C: ['#d5aaf6', '#1a2332'], D: ['#c58ef1', '#1a2332'],
  E: ['#a95ee6', '#fff'], F: ['#8a36d4', '#fff'], G: ['#6a1fb0', '#fff'],
};
const EQUIPEMENTS: { k: string; l: string; i: string }[] = [
  { k: 'balcon', l: 'Balcon', i: 'soleil' }, { k: 'terrasse', l: 'Terrasse', i: 'soleil' }, { k: 'jardin', l: 'Jardin', i: 'arbre' },
  { k: 'parking', l: 'Parking', i: 'parking' }, { k: 'ascenseur', l: 'Ascenseur', i: 'ascenseur' }, { k: 'cave', l: 'Cave', i: 'cave' },
  { k: 'gardien', l: 'Gardien', i: 'cle' }, { k: 'traversant', l: 'Traversant', i: 'traversant' },
  { k: 'cuisine_equipee', l: 'Cuisine équipée', i: 'coche' }, { k: 'climatisation', l: 'Climatisation', i: 'coche' },
];

const PARTIES: { id: string; l: string; i: string; vides: (f: Form) => string[] }[] = [
  { id: 'photos', l: 'Photos', i: 'photos', vides: () => [] },
  { id: 'lieu', l: 'Lieu et annonce', i: 'lieu', vides: f => ['titre', 'ville', 'url'].filter(k => vide(f[k])) },
  { id: 'bien', l: 'Le bien', i: 'surface', vides: f => ['surface', 'nb_pieces', 'nb_chambres', 'etage', 'annee_construction', 'exposition'].filter(k => vide(f[k])) },
  { id: 'equipements', l: 'Équipements', i: 'coche', vides: () => [] },
  { id: 'prix', l: 'Prix et charges', i: 'euro', vides: f => [...(f.bien_vente_id ? [] : ['prix_vendeur']), 'charges_trimestrielles', 'taxe_fonciere'].filter(k => vide(f[k])) },
  { id: 'energie', l: 'Énergie', i: 'boussole', vides: f => ['dpe'].filter(k => vide(f[k])) },
  { id: 'agence', l: 'Agence', i: 'immeuble', vides: f => (f.est_particulier ? [] : ['agence_nom', 'agence_tel'].filter(k => vide(f[k]))) },
  { id: 'description', l: 'Description', i: 'note', vides: f => ['description'].filter(k => vide(f[k])) },
];

/* ── Les briques, au niveau du module (une brique déclarée dans le rendu
      ferait perdre le curseur à chaque lettre, AGENTS §2.4) ── */

/* `groupe` : un champ fait de boutons (pastilles, échelle). Pas de <label>
   autour : un clic sur son titre appuierait sur le premier bouton. */
function Champ({ etiquette, icone, manque, className, children, note, groupe }: {
  etiquette: string; icone?: string; manque?: string | null; className?: string; children: React.ReactNode; note?: React.ReactNode; groupe?: boolean;
}) {
  const Balise = groupe ? 'div' : 'label';
  return (
    <Balise className={`${s.champ}${className ? ` ${className}` : ''}`} role={groupe ? 'group' : undefined} aria-label={groupe ? etiquette : undefined}>
      <span className={s.etiquette}>
        {icone && <Icone nom={icone} taille={14} epaisseur={2} />}
        {etiquette}
        {manque && <em>{`· ${manque}`}</em>}
      </span>
      {children}
      {note && <span className={s.note}>{note}</span>}
    </Balise>
  );
}

function Saisie({ valeur, onChange, vide: estVide, unite, type = 'text', placeholder, mode }: {
  valeur: any; onChange: (v: string) => void; vide?: boolean; unite?: string; type?: string; placeholder?: string;
  mode?: React.HTMLAttributes<HTMLInputElement>['inputMode'];
}) {
  return (
    <span className={s.boite} data-vide={estVide ? 'oui' : undefined}>
      <input type={type} inputMode={mode} value={val(valeur)} placeholder={placeholder} onChange={e => onChange(e.target.value)} />
      {unite && <span className={s.unite}>{unite}</span>}
    </span>
  );
}

function Pastilles({ choix, valeur, onChoix, petit }: { choix: string[]; valeur: any; onChoix: (v: string) => void; petit?: boolean }) {
  const actuel = String(valeur || '').toLowerCase();
  return (
    <span className={s.pastilles}>
      {choix.map(c => (
        <button key={c} type="button" className={s.pastille} data-ton={petit ? 'petit' : undefined}
          data-actif={actuel === c.toLowerCase()} aria-pressed={actuel === c.toLowerCase()}
          onClick={() => onChoix(actuel === c.toLowerCase() ? '' : c)}>{c}</button>
      ))}
    </span>
  );
}

function Echelle({ valeur, couleurs, onChoix, nom }: { valeur: any; couleurs: Record<string, [string, string]>; onChoix: (v: string) => void; nom: string }) {
  const actuel = String(valeur || '').toUpperCase().slice(0, 1);
  return (
    <span className={s.echelle} role="group" aria-label={nom}>
      {Object.entries(couleurs).map(([l, [fond, encre]]) => (
        <button key={l} type="button" className={s.lettre} data-actif={actuel === l} aria-pressed={actuel === l}
          style={{ background: fond, color: encre }} onClick={() => onChoix(actuel === l ? '' : l)}>{l}</button>
      ))}
    </span>
  );
}

function Partie({ id, titre, icone, aside, children }: { id: string; titre: string; icone: string; aside?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section id={`db-${id}`} data-partie={id} className={s.partie}>
      <div className={s.partieTete}>
        <span className={s.partieIc}><Icone nom={icone} taille={17} epaisseur={2} /></span>
        <h3>{titre}</h3>
        {aside}
      </div>
      {children}
    </section>
  );
}

export default function DetailBien({ form, setForm, saving, onFermer, onEnregistrer, onSupprimer, onReformuler, reformuling }: Props) {
  const [monte, setMonte] = useState(false);
  const [actif, setActif] = useState('photos');
  const [grand, setGrand] = useState(false);
  const [urlPhoto, setUrlPhoto] = useState('');
  const [survol, setSurvol] = useState<number | null>(null);
  const tire = useRef(-1);
  const voile = useRef<HTMLDivElement>(null);
  const parties = useRef<HTMLDivElement>(null);

  const set = (k: string, v: any) => setForm(f => ({ ...f, [k]: v }));
  const basculer = (k: string) => setForm(f => ({ ...f, [k]: !f[k] }));

  useEffect(() => { setMonte(true); }, []);
  useEffect(() => {
    const avant = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = avant; };
  }, []);
  /* Échap ferme, seulement quand la fenêtre est au premier plan. */
  useEffect(() => {
    const touche = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || !voile.current) return;
      const dessus = document.elementFromPoint(window.innerWidth / 2, window.innerHeight / 2);
      if (dessus && !voile.current.contains(dessus)) return;
      onFermer();
    };
    window.addEventListener('keydown', touche);
    return () => window.removeEventListener('keydown', touche);
  }, [onFermer]);

  /* La partie qu'on lit s'allume dans le menu. */
  const suivre = () => {
    const c = parties.current;
    if (!c) return;
    let courant = 'photos';
    c.querySelectorAll<HTMLElement>('[data-partie]').forEach(el => {
      if (el.offsetTop - c.offsetTop <= c.scrollTop + 60) courant = el.dataset.partie || courant;
    });
    if (c.scrollTop + c.clientHeight >= c.scrollHeight - 4) courant = 'description';
    setActif(courant);
  };
  const aller = (id: string) => {
    setActif(id);
    document.getElementById(`db-${id}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  /* Au téléphone, le menu est une rangée qui défile : la partie lue y reste visible. */
  useEffect(() => {
    voile.current?.querySelector(`[data-entree="${actif}"]`)?.scrollIntoView({ inline: 'nearest', block: 'nearest' });
  }, [actif]);

  if (!monte) return null;

  const f = form;
  const photos: string[] = Array.isArray(f.photos) ? f.photos : [];
  const veille = f.score !== null && f.score !== undefined && f.score !== '';
  const prixAcq = f.bien_vente_id
    ? nombre(f.prix_acquereur)
    : f.commission_type === 'pourcentage'
      ? Math.round(nombre(f.prix_vendeur) * (1 + nombre(f.commission_val) / 100))
      : nombre(f.prix_vendeur) + nombre(f.commission_val);
  const tel = String(f.agence_tel || '').trim();
  const manque = (k: string) => (vide(f[k]) ? 'à compléter' : null);
  const ajouterPhoto = () => {
    const u = urlPhoto.trim();
    if (!u.startsWith('http')) return;
    setForm(x => ({ ...x, photos: [...(x.photos || []), u] }));
    setUrlPhoto('');
  };
  const deposer = (i: number) => {
    const de = tire.current;
    setSurvol(null);
    tire.current = -1;
    if (de < 0 || de === i) return;
    setForm(x => {
      const arr = [...(x.photos || [])];
      const [p] = arr.splice(de, 1);
      arr.splice(i, 0, p);
      return { ...x, photos: arr };
    });
  };

  return createPortal(
    <div ref={voile} className={s.voile} onClick={e => { if (e.target === e.currentTarget) onFermer(); }}>
      <section className={s.fenetre} role="dialog" aria-modal="true" aria-label="Détail du bien">

        <div className={s.tete}>
          {photos[0] ? <img className={s.vignette} src={photos[0]} alt="" /> : <span className={s.vignette} />}
          <div className={s.teteTexte}>
            <small>DÉTAIL DU BIEN</small>
            <h2>{f.titre || `${f.type_bien || 'Bien'}${f.ville ? ` — ${f.ville}` : ''}`}</h2>
            <p>{veille ? 'Trouvé par la veille : tout ce qu’elle a relevé est ici, et tout se corrige.' : 'Ajouté à la main : complète ce qui manque.'}</p>
          </div>
          {prixAcq > 0 && (
            <div className={s.tetePrix}>
              <b>{euros(prixAcq)}</b>
              <span>{f.bien_vente_id ? 'prix affiché' : 'prix acquéreur'}</span>
            </div>
          )}
          <button type="button" className={s.fermer} onClick={onFermer} aria-label="Fermer sans enregistrer">
            <Icone nom="fermer" taille={18} epaisseur={2.4} />
          </button>
        </div>

        <div className={s.corps}>
          <nav className={s.menu} aria-label="Parties de la fiche">
            {PARTIES.map(p => {
              const n = p.vides(f).length;
              return (
                <button key={p.id} type="button" className={s.entree} data-actif={actif === p.id} data-entree={p.id} onClick={() => aller(p.id)}>
                  <Icone nom={p.i} taille={17} epaisseur={2} />{p.l}
                  {p.id === 'photos' ? <em style={{ color: '#64748b', background: '#eef2f8', borderColor: '#e3e8f0' }}>{photos.length}</em> : n > 0 ? <em>{n}</em> : null}
                </button>
              );
            })}
            <div className={s.aide}>
              <b><Icone nom="alerte" taille={13} epaisseur={2.2} />À compléter</b>
              {'Un cadre orange en pointillé : l’annonce ne le disait pas. Tu peux tout corriger ; la carte et l’espace du client reprennent ce que tu enregistres.'}
            </div>
          </nav>

          <div ref={parties} className={s.parties} onScroll={suivre}>

            <Partie id="photos" titre="Photos" icone="photos" aside={<small>Glisse pour changer l’ordre · la 1re est celle de la carte</small>}>
              {photos.length ? (
                <div className={s.photos}>
                  {photos.map((p, i) => (
                    <div key={p + i} className={s.photo} draggable data-survol={survol === i}
                      onDragStart={() => { tire.current = i; }}
                      onDragOver={e => { e.preventDefault(); setSurvol(i); }}
                      onDragLeave={() => setSurvol(null)}
                      onDrop={e => { e.preventDefault(); deposer(i); }}
                      onDragEnd={() => { tire.current = -1; setSurvol(null); }}>
                      <img src={p} alt="" />
                      <span className={s.numero}>{i + 1}</span>
                      {i === 0 && <span className={s.premiere}>Photo de la carte</span>}
                      <button type="button" className={s.oter} aria-label={`Retirer la photo ${i + 1}`}
                        onClick={() => setForm(x => ({ ...x, photos: (x.photos || []).filter((_: string, j: number) => j !== i) }))}>
                        <Icone nom="fermer" taille={14} epaisseur={2.6} />
                      </button>
                    </div>
                  ))}
                </div>
              ) : (
                <div className={s.sansPhoto}>Pas encore de photo : colle l’adresse d’une image ci-dessous.</div>
              )}
              <div className={s.ajout}>
                <span className={s.boite}>
                  <input value={urlPhoto} onChange={e => setUrlPhoto(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') ajouterPhoto(); }}
                    placeholder="Adresse d’une photo (clic droit sur l’image → Copier l’adresse)" aria-label="Adresse d’une photo à ajouter" />
                </span>
                <button type="button" className={s.bouton} onClick={ajouterPhoto}><Icone nom="plus" taille={16} epaisseur={2.2} />Ajouter</button>
              </div>
            </Partie>

            <Partie id="lieu" titre="Lieu et annonce" icone="lieu">
              <div className={s.grille}>
                <Champ etiquette="Type de bien" className={s.g4} groupe>
                  <Pastilles choix={TYPES} valeur={f.type_bien} onChoix={v => set('type_bien', v || null)} />
                </Champ>
                <Champ etiquette="Titre" manque={manque('titre')} className={s.g4}>
                  <Saisie valeur={f.titre} onChange={v => set('titre', v)} vide={vide(f.titre)} />
                </Champ>
                <Champ etiquette="Adresse" icone="lieu" className={s.g2}
                  note={vide(f.adresse) && f.adresse_probable ? `Adresse probable relevée : ${f.adresse_probable}` : undefined}>
                  <Saisie valeur={f.adresse} onChange={v => set('adresse', v)} placeholder="Numéro et rue" />
                </Champ>
                <Champ etiquette="Code postal">
                  <Saisie valeur={f.code_postal} onChange={v => set('code_postal', v)} mode="numeric" />
                </Champ>
                <Champ etiquette="Ville" manque={manque('ville')}>
                  <Saisie valeur={f.ville} onChange={v => set('ville', v)} vide={vide(f.ville)} />
                </Champ>
                <Champ etiquette="Quartier" className={s.g2}>
                  <Saisie valeur={f.quartier} onChange={v => set('quartier', v)} placeholder="Parchamp, Rhin-et-Danube…" />
                </Champ>
                <Champ etiquette="Situation" className={s.g2}>
                  <Saisie valeur={f.situation} onChange={v => set('situation', v)} placeholder="à 4 min du métro, au calme sur cour…" />
                </Champ>
                <Champ etiquette="Lien de l’annonce" icone="lien" manque={manque('url')} className={s.g3}>
                  <span className={s.boite} data-vide={vide(f.url) ? 'oui' : undefined}>
                    <input value={val(f.url)} onChange={e => set('url', e.target.value)} placeholder="https://…" />
                    {!vide(f.url) && (
                      <a className={s.ouvrirLien} href={f.url} target="_blank" rel="noopener noreferrer" aria-label="Ouvrir l’annonce" onClick={e => e.stopPropagation()}>
                        <Icone nom="lien" taille={15} epaisseur={2} />
                      </a>
                    )}
                  </span>
                </Champ>
                <Champ etiquette="Portail">
                  <Saisie valeur={f.source_portail} onChange={v => set('source_portail', v)} placeholder="SeLoger…" />
                </Champ>
              </div>
            </Partie>

            <Partie id="bien" titre="Le bien" icone="surface">
              <div className={s.grille}>
                <Champ etiquette="Surface" icone="surface" manque={manque('surface')}>
                  <Saisie valeur={f.surface} onChange={v => set('surface', v)} vide={vide(f.surface)} unite="m²" mode="decimal" />
                </Champ>
                <Champ etiquette="Séjour" icone="sofa">
                  <Saisie valeur={f.surface_sejour} onChange={v => set('surface_sejour', v)} unite="m²" mode="decimal" />
                </Champ>
                <Champ etiquette="Pièces" icone="pieces" manque={manque('nb_pieces')}>
                  <Saisie valeur={f.nb_pieces} onChange={v => set('nb_pieces', v)} vide={vide(f.nb_pieces)} mode="numeric" />
                </Champ>
                <Champ etiquette="Chambres" icone="lit" manque={manque('nb_chambres')}>
                  <Saisie valeur={f.nb_chambres} onChange={v => set('nb_chambres', v)} vide={vide(f.nb_chambres)} mode="numeric" />
                </Champ>
                <Champ etiquette="Étage" icone="immeuble" manque={manque('etage')}>
                  <span className={s.boite} data-vide={vide(f.etage) ? 'oui' : undefined}>
                    <input inputMode="numeric" value={val(f.etage)} onChange={e => set('etage', e.target.value)} placeholder="0 = RDC" aria-label="Étage" />
                    <span className={s.unite}>sur</span>
                    <input inputMode="numeric" value={val(f.etage_total)} onChange={e => set('etage_total', e.target.value)} aria-label="Nombre d’étages de l’immeuble" />
                  </span>
                </Champ>
                <Champ etiquette="Année" icone="calendrier" manque={manque('annee_construction')}>
                  <Saisie valeur={f.annee_construction} onChange={v => set('annee_construction', v)} vide={vide(f.annee_construction)} mode="numeric" />
                </Champ>
                <Champ etiquette="Lots" icone="lots">
                  <Saisie valeur={f.nb_lots} onChange={v => set('nb_lots', v)} mode="numeric" />
                </Champ>
                <Champ etiquette="Salles d’eau · WC">
                  <span className={s.boite}>
                    <input inputMode="numeric" value={val(f.nb_salles_bain)} onChange={e => set('nb_salles_bain', e.target.value)} aria-label="Salles d’eau" />
                    <span className={s.unite}>·</span>
                    <input inputMode="numeric" value={val(f.nb_wc)} onChange={e => set('nb_wc', e.target.value)} aria-label="WC" />
                  </span>
                </Champ>
                <Champ etiquette="Exposition" icone="boussole" manque={vide(f.exposition) ? 'l’annonce ne la donne pas' : null} className={s.g4}>
                  <Saisie valeur={f.exposition} onChange={v => set('exposition', v)} vide={vide(f.exposition)} placeholder="Sud-ouest, traversant est-ouest…" />
                  <Pastilles petit choix={EXPOSITIONS} valeur={f.exposition} onChoix={v => set('exposition', v || null)} />
                </Champ>
                <Champ etiquette="État général" className={s.g4} groupe>
                  <Pastilles choix={ETATS} valeur={f.etat_general} onChoix={v => set('etat_general', v || null)} />
                </Champ>
              </div>
            </Partie>

            <Partie id="equipements" titre="Équipements" icone="coche" aside={<small>Un appui coche ou décoche</small>}>
              <div className={s.equip}>
                {EQUIPEMENTS.map(e => (
                  <button key={e.k} type="button" className={s.tuile} aria-pressed={!!f[e.k]} onClick={() => basculer(e.k)}>
                    <Icone nom={e.i} taille={18} epaisseur={2} />{e.l}
                    <i><Icone nom="coche" taille={11} epaisseur={3.2} /></i>
                  </button>
                ))}
              </div>
              <div className={s.grille} style={{ marginTop: 12 }}>
                <Champ etiquette="Surface extérieure" icone="soleil">
                  <Saisie valeur={f.surface_exterieur} onChange={v => set('surface_exterieur', v)} unite="m²" mode="decimal" />
                </Champ>
                <Champ etiquette="Places de parking" icone="parking">
                  <Saisie valeur={f.nb_parking} onChange={v => set('nb_parking', v)} mode="numeric" />
                </Champ>
              </div>
            </Partie>

            <Partie id="prix" titre="Prix et charges" icone="euro">
              <div className={s.grille}>
                {f.bien_vente_id ? (
                  <div className={`${s.mandat} ${s.g4}`}>
                    <b>{prixAcq ? euros(prixAcq) : '—'}</b>
                    {'Ce bien est un mandat de l’agence : son prix et les honoraires de l’agence se changent sur la fiche du bien.'}
                  </div>
                ) : (
                  <>
                    <Champ etiquette="Prix vendeur" manque={manque('prix_vendeur')}>
                      <Saisie valeur={f.prix_vendeur} onChange={v => set('prix_vendeur', v)} vide={vide(f.prix_vendeur)} unite="€" mode="numeric" />
                    </Champ>
                    <Champ etiquette="Tes honoraires" groupe>
                      <span className={s.boite}>
                        <span className={s.segment} role="group" aria-label="Pourcentage ou montant">
                          <button type="button" data-actif={f.commission_type === 'pourcentage'} onClick={() => set('commission_type', 'pourcentage')}>%</button>
                          <button type="button" data-actif={f.commission_type !== 'pourcentage'} onClick={() => set('commission_type', 'montant')}>€</button>
                        </span>
                        <input inputMode="decimal" value={val(f.commission_val)} onChange={e => set('commission_val', e.target.value)} aria-label="Montant des honoraires" />
                      </span>
                    </Champ>
                    <Champ etiquette="Prix acquéreur" className={s.g2} groupe>
                      <span className={s.prixAcq}>
                        <span>Ce que le client verra</span>
                        <b>{prixAcq ? euros(prixAcq) : '—'}</b>
                        {prixAcq > 0 && nombre(f.surface) > 0 && <small>{`${Math.round(prixAcq / nombre(f.surface)).toLocaleString('fr-FR')} €/m²`}</small>}
                      </span>
                    </Champ>
                  </>
                )}
                <Champ etiquette="Charges de copro" manque={manque('charges_trimestrielles')}
                  note={nombre(f.charges_trimestrielles) > 0 ? `soit ${euros(nombre(f.charges_trimestrielles) * 4)} par an` : undefined}>
                  <Saisie valeur={f.charges_trimestrielles} onChange={v => set('charges_trimestrielles', v)} vide={vide(f.charges_trimestrielles)} unite="€ / trim." mode="numeric" />
                </Champ>
                <Champ etiquette="Ce qu’elles comprennent" className={s.g2}>
                  <Saisie valeur={f.charges_comprises} onChange={v => set('charges_comprises', v)} placeholder="chauffage et eau chaude collectifs, gardien" />
                </Champ>
                <Champ etiquette="Taxe foncière" manque={manque('taxe_fonciere')}>
                  <Saisie valeur={f.taxe_fonciere} onChange={v => set('taxe_fonciere', v)} vide={vide(f.taxe_fonciere)} unite="€ / an" mode="numeric" />
                </Champ>
              </div>
            </Partie>

            <Partie id="energie" titre="Énergie" icone="boussole">
              <div className={s.grille}>
                <Champ etiquette="DPE" manque={manque('dpe')} className={s.g2} groupe>
                  <Echelle nom="DPE" valeur={f.dpe} couleurs={DPE_C} onChoix={v => set('dpe', v || null)} />
                </Champ>
                <Champ etiquette="GES" className={s.g2} groupe>
                  <Echelle nom="GES" valeur={f.ges} couleurs={GES_C} onChoix={v => set('ges', v || null)} />
                </Champ>
                <Champ etiquette="Consommation">
                  <Saisie valeur={f.dpe_conso} onChange={v => set('dpe_conso', v)} unite="kWh/m²/an" mode="numeric" />
                </Champ>
                <Champ etiquette="Émissions">
                  <Saisie valeur={f.ges_emissions} onChange={v => set('ges_emissions', v)} unite="kg CO₂/m²/an" mode="numeric" />
                </Champ>
                <Champ etiquette="Chauffage">
                  <span className={s.boite}>
                    <select value={val(f.chauffage)} onChange={e => set('chauffage', e.target.value || null)}>
                      <option value="">—</option>
                      {CHAUFFAGES.map(c => <option key={c} value={c}>{c}</option>)}
                    </select>
                  </span>
                </Champ>
                <Champ etiquette="Énergie">
                  <span className={s.boite}>
                    <select value={val(f.source_energie)} onChange={e => set('source_energie', e.target.value || null)}>
                      <option value="">—</option>
                      {ENERGIES.map(c => <option key={c} value={c}>{c}</option>)}
                    </select>
                  </span>
                </Champ>
              </div>
            </Partie>

            <Partie id="agence" titre="Agence" icone="immeuble">
              <div className={s.grille}>
                <Champ etiquette="Qui vend" className={s.g4} groupe>
                  <span className={s.pastilles}>
                    <button type="button" className={s.pastille} data-actif={!f.est_particulier} aria-pressed={!f.est_particulier} onClick={() => set('est_particulier', false)}>Une agence</button>
                    <button type="button" className={s.pastille} data-actif={!!f.est_particulier} aria-pressed={!!f.est_particulier} onClick={() => set('est_particulier', true)}>Un particulier</button>
                  </span>
                </Champ>
                <Champ etiquette={f.est_particulier ? 'Nom (facultatif)' : 'Nom de l’agence'} icone="immeuble" manque={f.est_particulier ? null : manque('agence_nom')} className={s.g2}>
                  <Saisie valeur={f.agence_nom} onChange={v => set('agence_nom', v)} vide={!f.est_particulier && vide(f.agence_nom)} />
                </Champ>
                <Champ etiquette="Téléphone" icone="tel" manque={f.est_particulier ? null : manque('agence_tel')}>
                  <Saisie valeur={f.agence_tel} onChange={v => set('agence_tel', v)} vide={!f.est_particulier && vide(f.agence_tel)} type="tel" placeholder="01 23 45 67 89" />
                </Champ>
                {tel ? (
                  <a className={s.appeler} href={`tel:${tel.replace(/[^\d+]/g, '')}`}><Icone nom="tel" taille={15} epaisseur={2} />Appeler</a>
                ) : <span />}
              </div>
            </Partie>

            <Partie id="description" titre="Description" icone="note" aside={
              <span style={{ marginLeft: 'auto', display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <button type="button" className={s.bouton} onClick={() => setGrand(g => !g)}>
                  <Icone nom="agrandir" taille={15} epaisseur={2} />{grand ? 'Réduire' : 'Agrandir'}
                </button>
                <button type="button" className={s.bouton} data-ton="or" onClick={onReformuler} disabled={reformuling || vide(f.description)}>
                  <Icone nom="etoile" taille={15} epaisseur={2} />{reformuling ? 'Reformulation…' : 'Reformuler'}
                </button>
              </span>
            }>
              <textarea className={s.texte} data-grand={grand} value={val(f.description)} aria-label="Description du bien"
                onChange={e => set('description', e.target.value)} placeholder="Description du bien…" />
            </Partie>
          </div>
        </div>

        <div className={s.pied}>
          <button type="button" className={s.supprimer} onClick={onSupprimer} aria-label="Supprimer le bien"><Icone nom="corbeille" taille={15} epaisseur={2} /><span className={s.supTxt}>Supprimer le bien</span></button>
          <span className={s.piedNote}>Ce que tu corriges ici, la carte et l’espace du client le reprennent.</span>
          <button type="button" className={s.bouton} onClick={onFermer}>Annuler</button>
          <button type="button" className={s.bouton} data-ton="navy" onClick={onEnregistrer} disabled={saving}>
            <Icone nom="coche" taille={16} epaisseur={2.4} />{saving ? 'Enregistrement…' : 'Enregistrer'}
          </button>
        </div>
      </section>
    </div>,
    document.body,
  );
}
