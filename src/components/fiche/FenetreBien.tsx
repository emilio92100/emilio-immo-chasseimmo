'use client';
/* ═══ Les biens en lignes, et le bien en grand (V3.165) ═══════════════════

   Ce qu'Alexandre a choisi sur les maquettes (« E · la liste et le grand
   pop-up ») : dans Veille, Sélection et Présentés, une ligne par bien, avec
   de quoi le reconnaître ; « Voir en grand » ouvre le bien entier dans une
   fenêtre. Les boutons y sont toujours en bas ; après un choix (Retenir,
   Écarter, Envoyer), la fenêtre passe au bien suivant au lieu de se fermer,
   et les flèches ← → avancent sans rien décider.

   Dans la fenêtre, le bien d'abord (photos, prix, caractéristiques,
   équipements, qui le vend), puis, à part, ce que la veille en dit (la note,
   l'avis, les atouts, ce qu'il faut vérifier ou trancher, le marché). */

import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import Cascade from '@/components/shared/Cascade';
import {
  Icone, Specs, LigneBien, BandeauMarche, Appreciation, BilanBien, AvisLien, Frise, Visionneuse,
  CaseACocher, resumeSpecs, etatLien, OR,
} from './ParcoursBien';
import { telAgence } from '@/lib/rapprochement';
import s from './FenetreBien.module.css';

const euros = (n: any) => (n == null || n === '' || !isFinite(Number(n)) ? '—' : `${Number(n).toLocaleString('fr-FR')} €`);

/** Un bien (table `biens`) ou une proposition de la veille : les mêmes
    informations ne portent pas le même nom. */
export function infosBien(b: any) {
  const estBien = b && ('etape' in b || 'prix_vendeur' in b);
  const agence = (estBien ? b.agence_nom : b.agence) || null;
  const portail = (estBien ? b.source_portail : b.portail) || null;
  /* Le numéro de l'agence : relevé par la veille, ou noté pour elle parmi les diffuseurs. */
  const tel = telAgence(b);
  const marche = estBien ? { ...b, prix: b.prix_vendeur, agence: b.agence_nom, portail: b.source_portail } : b;
  return { estBien, agence, portail, tel, marche };
}

/** « 18 rue Vavin, Paris 6e » : l'adresse et la ville, sans répéter la ville. */
export function lieuDe(b: any): string {
  const rue = String(b?.adresse || b?.adresse_probable || b?.quartier || '').trim();
  const ville = String(b?.ville || '').trim();
  if (!rue) return ville;
  if (!ville || rue.toLowerCase().includes(ville.toLowerCase())) return rue;
  return `${rue}, ${ville}`;
}

/** Un mot sur le bien dans le pied de la fenêtre (le type, le portail…). */
export function InfoPied({ children }: { children: React.ReactNode }) {
  return <span className={s.infoPied}>{children}</span>;
}

const couleurNote = (n: number) => (n >= 85 ? '#16a34a' : n >= 70 ? OR : n >= 50 ? '#d97706' : '#dc2626');

/* ═══ Les petites étiquettes d'une ligne ═══════════════════════════════ */

export function PucesBien({ b, avecNote = true }: { b: any; avecNote?: boolean }) {
  const p: React.ReactNode[] = [];
  const n = Number(b?.score);
  if (avecNote && b?.score !== null && b?.score !== undefined && b?.score !== '' && isFinite(n)) {
    p.push(<span key="n" className={s.puce} data-ton="veille">{'Veille '}<b>{n}</b></span>);
  }
  resumeSpecs(b).split(' · ').filter(Boolean).forEach((t, i) => p.push(<span key={'s' + i} className={s.puce}>{t}</span>));
  const eq: string[] = [];
  if (b?.terrasse && !b?.surface_exterieur) eq.push('Terrasse');
  if (b?.balcon && !b?.surface_exterieur) eq.push('Balcon');
  if (b?.jardin && !b?.surface_exterieur) eq.push('Jardin');
  if (b?.parking) eq.push(Number(b.nb_parking) > 1 ? `${b.nb_parking} parkings` : 'Parking');
  if (b?.ascenseur) eq.push('Ascenseur');
  if (b?.cave) eq.push('Cave');
  eq.forEach((t, i) => p.push(<span key={'e' + i} className={s.puce} data-ton="equip">{t}</span>));
  if (b?.est_particulier) p.push(<span key="x" className={s.puce} data-ton="vert">Particulier</span>);
  const baisses = Number(b?.nb_baisses) || 0;
  if (baisses > 0) p.push(<span key="b" className={s.puce} data-ton="vert">{baisses > 1 ? `${baisses} baisses de prix` : '1 baisse de prix'}</span>);
  return <span className={s.puces}>{p}</span>;
}

/* ═══ La ligne ═════════════════════════════════════════════════════════ */

export function LigneListe({ b, id, className, accent, coche, attente, onOuvrir, prix, sousPrix, droite, bas, puces }: {
  b: any; id?: string; className?: string;
  /** la couleur du liseré de gauche (le retour du client, le verdict de la veille) */
  accent?: string;
  coche?: { actif: boolean; onBascule: () => void };
  attente?: boolean;
  onOuvrir: () => void;
  prix: string; sousPrix?: string | null;
  droite?: React.ReactNode; bas?: React.ReactNode; puces?: React.ReactNode;
}) {
  const photos: string[] = (b?.photos || []).filter(Boolean);
  const titre = b?.titre || `${b?.type_bien || 'Bien'} — ${b?.ville || ''}`;
  const lieu = lieuDe(b);
  return (
    <div id={id} className={`${s.ligne}${className ? ` ${className}` : ''}`} data-coche={coche ? (coche.actif ? 'oui' : 'non') : undefined}
      data-attente={attente ? 'oui' : undefined} style={{ ['--accent' as string]: accent || '#e3e8f0' }}>
      <div className={s.haut}>
        {coche && (
          <span className={s.coche}>
            <CaseACocher actif={coche.actif} onClick={coche.onBascule}
              titre={coche.actif ? `Décocher « ${titre} »` : `Cocher « ${titre} » pour l'envoyer avec d'autres`} />
          </span>
        )}
        <button type="button" className={s.ouvrir} onClick={onOuvrir} aria-label={`Voir en grand : ${titre}`}>
          <span className={s.photo}>
            {photos[0]
              ? <img src={photos[0]} alt="" loading="lazy" />
              : <span className={s.sansPhoto}><Icone nom="maison" taille={20} /></span>}
            {photos.length > 1 && <span className={s.nbPhotos}><Icone nom="photos" taille={11} epaisseur={2.2} />{photos.length}</span>}
          </span>
          <span className={s.texte}>
            <span className={s.titre}>{titre}</span>
            {lieu && <span className={s.lieu}><Icone nom="lieu" taille={14} /><span>{lieu}</span></span>}
            {puces ?? <PucesBien b={b} />}
          </span>
        </button>
        <span className={s.prix}><b>{prix}</b>{sousPrix && <small>{sousPrix}</small>}</span>
        <span className={s.actions}>
          {droite}
          <button type="button" className={s.voir} onClick={onOuvrir} aria-label="Voir en grand"><Icone nom="agrandir" taille={15} epaisseur={2} /><span className={s.voirTxt}>Voir en grand</span></button>
        </span>
      </div>
      {bas}
    </div>
  );
}

/** Le bas d'une ligne : un état, un mot, des boutons. */
export function BasLigne({ couleur, fond, bord, icone, etat, mot, vide, boutons }: {
  couleur: string; fond: string; bord: string; icone: string; etat: string;
  mot?: React.ReactNode; vide?: boolean; boutons?: React.ReactNode;
}) {
  return (
    <div className={s.bas} style={{ ['--fond' as string]: fond, ['--bord' as string]: bord, ['--encre' as string]: couleur }}>
      <span className={s.basEtat}><Icone nom={icone} taille={15} epaisseur={2.1} />{etat}</span>
      {mot && <span className={s.basMot} data-vide={vide ? 'oui' : undefined}>{mot}</span>}
      {boutons && <span className={s.basBoutons}>{boutons}</span>}
    </div>
  );
}

export function BoutonBas({ children, onClick, ton }: { children: React.ReactNode; onClick: () => void; ton?: 'violet' }) {
  return <button type="button" className={s.basBouton} data-ton={ton} onClick={onClick}>{children}</button>;
}

/* ═══ Les boutons du pied de la fenêtre ════════════════════════════════ */

export function BoutonPied({ children, onClick, href, ton, disabled, titre }: {
  children: React.ReactNode; onClick?: () => void; href?: string;
  ton?: 'or' | 'violet' | 'navy' | 'rouge'; disabled?: boolean; titre?: string;
}) {
  if (href) return <a className={s.bp} data-ton={ton} href={href} target="_blank" rel="noopener noreferrer" title={titre}>{children}</a>;
  return <button type="button" className={s.bp} data-ton={ton} onClick={onClick} disabled={disabled} title={titre}>{children}</button>;
}

/** Un lien discret du pied (Retirer, Remettre en sélection…). */
export function LienPied({ children, onClick, pale, titre }: { children: React.ReactNode; onClick: () => void; pale?: boolean; titre?: string }) {
  return <button type="button" className={s.lp} data-ton={pale ? 'pale' : undefined} onClick={onClick} title={titre}>{children}</button>;
}

/** Ce qui pousse les boutons à droite. */
export function Ressort() { return <span className={s.ressort} aria-hidden="true" />; }

/** Le bouton doré « Envoyer » au bout d'une ligne de la Sélection. */
export function BoutonVite({ children, onClick, titre }: { children: React.ReactNode; onClick: () => void; titre?: string }) {
  return <button type="button" className={s.vite} onClick={onClick} title={titre}>{children}</button>;
}

/** Le champ du motif d'écart, dans le pied de la fenêtre. */
export function ChampPied(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={s.motif} />;
}

/* ═══ Les photos en mosaïque ═══════════════════════════════════════════ */

function Mosaique({ photos, plans, coinGauche, coinDroit }: {
  photos: string[]; plans: string[]; coinGauche?: React.ReactNode; coinDroit?: React.ReactNode;
}) {
  const [voir, setVoir] = useState<number | null>(null);
  const [plan, setPlan] = useState<number | null>(null);
  const n = photos.length;
  const petites = n >= 5 ? 4 : n >= 3 ? 2 : n === 2 ? 1 : 0;
  const reste = n - 1 - petites;
  const boutonPlan = plans.length > 0 && (
    <span className={`${s.coin} ${s.coinB}`}>
      <button type="button" className={s.bouleBlanche} onClick={() => setPlan(0)}>
        <Icone nom="plan" taille={14} epaisseur={2} />{plans.length > 1 ? `Les plans · ${plans.length}` : 'Voir le plan'}
      </button>
    </span>
  );
  if (!n) {
    return (
      <div style={{ position: 'relative' }}>
        <div className={s.vide}>Pas de photo dans l&apos;annonce</div>
        {boutonPlan}
        {plan !== null && <Visionneuse photos={plans} depart={plan} onFerme={() => setPlan(null)} clair />}
      </div>
    );
  }
  return (
    <div className={s.mosaique} data-n={n >= 5 ? 5 : n >= 3 ? 3 : n}>
      <button type="button" className={`${s.case} ${s.grande}`} onClick={() => setVoir(0)} aria-label="Agrandir la photo 1">
        <img src={photos[0]} alt="" />
      </button>
      {photos.slice(1, 1 + petites).map((u, i) => (
        <button key={u + i} type="button" className={s.case} onClick={() => setVoir(i + 1)} aria-label={`Agrandir la photo ${i + 2}`}>
          <img src={u} alt="" loading="lazy" />
          {i === petites - 1 && reste > 0 && <span className={s.encore}>{`+${reste}`}</span>}
        </button>
      ))}
      {n > 1 && <span className={s.compteMobile}>{`${n} photos`}</span>}
      {coinGauche && <span className={`${s.coin} ${s.coinG}`}>{coinGauche}</span>}
      {coinDroit && <span className={`${s.coin} ${s.coinD}`}>{coinDroit}</span>}
      {boutonPlan}
      {voir !== null && <Visionneuse photos={photos} depart={voir} onFerme={() => setVoir(null)} />}
      {plan !== null && <Visionneuse photos={plans} depart={plan} onFerme={() => setPlan(null)} clair />}
    </div>
  );
}

/* ═══ La fenêtre ═══════════════════════════════════════════════════════ */

interface Props {
  biens: any[];
  index: number;
  onIndex: (i: number) => void;
  onFermer: () => void;
  recherche?: any;
  /** sous les photos : le retour du client, « plus disponible », la fiche PDF… */
  bandeau?: (b: any) => React.ReactNode;
  /** le prix affiché, et ce qu'on écrit dessous */
  prix: (b: any) => { montant: any; dessous?: React.ReactNode };
  coinPhoto?: (b: any) => React.ReactNode;
  pied: (b: any) => React.ReactNode;
  onFiche?: (id: string) => void;
  onPhotos?: (b: any) => void;
  onScore?: (b: any) => void;
  /** la frise « Parcours du bien » (les biens, pas les propositions de la veille) */
  parcours?: boolean;
  /** un mot bref après un choix (« Retenu : il passe dans Sélection. ») */
  message?: string | null;
}

export default function FenetreBien({ biens, index, onIndex, onFermer, recherche, bandeau, prix, coinPhoto, pied, onFiche, onPhotos, onScore, parcours, message }: Props) {
  const [monte, setMonte] = useState(false);
  const [voirParcours, setVoirParcours] = useState(false);
  const [voirDesc, setVoirDesc] = useState(false);
  const voile = useRef<HTMLDivElement>(null);
  const corps = useRef<HTMLDivElement>(null);
  const n = biens.length;
  const i = Math.min(Math.max(index, 0), Math.max(n - 1, 0));
  const b = biens[i];

  useEffect(() => { setMonte(true); }, []);

  /* La page derrière ne défile plus tant que la fenêtre est ouverte. */
  useEffect(() => {
    const avant = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = avant; };
  }, []);

  /* Un autre bien : on remonte en haut, le descriptif et le parcours se replient. */
  useEffect(() => {
    corps.current?.scrollTo({ top: 0 });
    setVoirDesc(false);
    setVoirParcours(false);
  }, [b?.id]);

  /* Clavier : Échap ferme, ← → changent de bien. Seulement quand la fenêtre
     est au premier plan (une fenêtre ouverte par-dessus garde ses touches)
     et pas pendant qu'on écrit. */
  useEffect(() => {
    const touche = (e: KeyboardEvent) => {
      const v = voile.current;
      if (!v) return;
      const dessus = document.elementFromPoint(window.innerWidth / 2, window.innerHeight / 2);
      if (dessus && !v.contains(dessus)) return;
      const cible = e.target as HTMLElement | null;
      const ecrit = !!cible && (cible.tagName === 'INPUT' || cible.tagName === 'TEXTAREA' || cible.isContentEditable);
      if (e.key === 'Escape') { onFermer(); return; }
      if (ecrit) return;
      if (e.key === 'ArrowRight' && n > 1) onIndex((i + 1) % n);
      if (e.key === 'ArrowLeft' && n > 1) onIndex((i - 1 + n) % n);
    };
    window.addEventListener('keydown', touche);
    return () => window.removeEventListener('keydown', touche);
  }, [i, n, onIndex, onFermer]);

  if (!monte || !b) return null;

  const { estBien, agence, portail, tel, marche } = infosBien(b);
  const lien = etatLien(marche);
  const titre = b.titre || `${b.type_bien || 'Bien'} — ${b.ville || ''}`;
  const lieu = lieuDe(b);
  const pr = prix(b);
  const score = Number(b.score);
  const aNote = b.score !== null && b.score !== undefined && b.score !== '' && isFinite(score);
  const aPoints = (Array.isArray(b.points_forts) && b.points_forts.length > 0) || (Array.isArray(b.points_attention) && b.points_attention.length > 0);
  const photos: string[] = (b.photos || []).filter(Boolean);
  const plans: string[] = (b.plans || []).filter(Boolean);

  const ouvrirParcours = () => {
    setVoirParcours(v => !v);
    window.setTimeout(() => document.getElementById('emi-fb-parcours')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 60);
  };

  return createPortal(
    <div ref={voile} className={s.voile} onClick={onFermer}>
      <section className={s.fenetre} role="dialog" aria-modal="true" aria-label={titre} onClick={e => e.stopPropagation()}>

        <div className={s.barre}>
          <div className={s.nav}>
            <button type="button" className={s.fleche} onClick={() => onIndex((i - 1 + n) % n)} disabled={n < 2} aria-label="Bien précédent">
              <Icone nom="chevronG" taille={19} epaisseur={2.4} />
            </button>
            <span className={s.position}>{`${i + 1} sur ${n}`}</span>
            <button type="button" className={s.fleche} onClick={() => onIndex((i + 1) % n)} disabled={n < 2} aria-label="Bien suivant">
              <Icone nom="chevronD" taille={19} epaisseur={2.4} />
            </button>
          </div>
          {message && <span className={s.message} role="status"><Icone nom="coche" taille={13} epaisseur={2.8} />{message}</span>}
          <div className={s.liens}>
            {b.url && lien.etat !== 'retire' && (
              <a className={s.lien} href={b.url} target="_blank" rel="noopener noreferrer">
                <Icone nom="lien" taille={15} epaisseur={2} />{lien.etat === 'remplace' ? 'Annonce en ligne' : 'Annonce d’origine'}
              </a>
            )}
            {onFiche && (
              <button type="button" className={s.lien} onClick={() => onFiche(b.id)}>
                <Icone nom="crayon" taille={15} epaisseur={2} />Détail
              </button>
            )}
            {parcours && (
              <button type="button" className={s.lien} data-actif={voirParcours} onClick={ouvrirParcours}>
                <Icone nom="horloge" taille={15} epaisseur={2} />Parcours
              </button>
            )}
            {tel && (
              <a className={s.lien} data-ton="appel" href={`tel:${tel.replace(/[^\d+]/g, '')}`}>
                <Icone nom="tel" taille={15} epaisseur={2} />Appeler l’agence
              </a>
            )}
          </div>
          <button type="button" className={s.fermer} onClick={onFermer} aria-label="Fermer et revenir à la liste">
            <Icone nom="fermer" taille={18} epaisseur={2.4} />
          </button>
        </div>

        <div ref={corps} className={s.corps}>
          <Cascade cle={b.id} className={s.pile}>
            <Mosaique photos={photos} plans={plans} coinGauche={coinPhoto?.(b)}
              coinDroit={onPhotos && photos.length > 0 ? (
                <button type="button" className={s.bouleBlanche} onClick={() => onPhotos(b)}>
                  <Icone nom="photos" taille={14} epaisseur={2} />{`Réorganiser · ${photos.length}`}
                </button>
              ) : undefined} />

            {bandeau?.(b)}
            {estBien && <AvisLien p={marche} />}

            <div className={s.tete}>
              <div style={{ minWidth: 0 }}>
                <h2>{titre}</h2>
                {lieu && (
                  <div className={s.adresse}>
                    <Icone nom="lieu" taille={15} />
                    <span>{`${lieu}${b.situation ? ` — ${b.situation}` : ''}`}</span>
                    {!b.adresse && b.adresse_probable && <span className={s.probable}>adresse probable</span>}
                  </div>
                )}
              </div>
              <div className={s.prixGrand}>
                <b>{euros(pr.montant)}</b>
                {pr.dessous}
              </div>
            </div>

            <div>
              <span className={s.rubrique}>Caractéristiques</span>
              <Specs p={b} recherche={recherche} />
            </div>

            <LigneBien p={b} recherche={recherche} />

            {(agence || tel || b.est_particulier || portail) && (
              <div>
                <span className={s.rubrique}>Qui le vend</span>
                <div className={s.vendeur}>
                  <span className={s.vendeurIc}><Icone nom={b.est_particulier ? 'clients' : 'immeuble'} taille={18} /></span>
                  <span className={s.vendeurTxt}>
                    <b>{b.est_particulier ? 'Un particulier' : agence || 'Agence non relevée'}</b>
                    {tel
                      ? <span>{`${tel}${portail ? ` · vu sur ${portail}` : ''}`}</span>
                      : <span data-manque="oui">{`Numéro pas relevé${onFiche ? ' : tu peux l’ajouter dans Détail' : ''}${portail ? ` · vu sur ${portail}` : ''}`}</span>}
                  </span>
                  {tel && (
                    <a className={s.appeler} href={`tel:${tel.replace(/[^\d+]/g, '')}`}>
                      <Icone nom="tel" taille={15} epaisseur={2} />Appeler
                    </a>
                  )}
                </div>
              </div>
            )}

            <section className={s.veille} aria-label="Ce que dit la veille">
              <div className={s.veilleTete}>
                <Icone nom="loupe" taille={16} epaisseur={2.2} />
                <strong>Ce que dit la veille</strong>
                <span><Icone nom="cadenas" taille={12} epaisseur={2} />pour toi seul</span>
              </div>
              <div className={s.veilleCorps}>
                {(aNote || b.appreciation) ? (
                  <div className={s.note}>
                    {aNote && (
                      <button type="button" className={s.anneau} style={{ ['--c' as string]: couleurNote(score) }}
                        onClick={() => onScore?.(b)} title="Comment cette note est calculée" aria-label={`Note ${score} sur 100 : voir le détail`}>
                        <b>{score}</b><small>/ 100</small>
                      </button>
                    )}
                    <div><Appreciation p={b} /></div>
                  </div>
                ) : !aPoints && (
                  <div className={s.sansNote}>{estBien && !b.score ? 'La veille n’a pas noté ce bien : il a été ajouté à la main.' : 'Pas de note pour ce bien.'}</div>
                )}
                <BilanBien p={b} />
                <BandeauMarche p={marche} sobre />
              </div>
            </section>

            {b.description && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
                <button type="button" className={s.lire} onClick={() => setVoirDesc(v => !v)}>
                  <Icone nom="note" taille={15} epaisseur={2} />{voirDesc ? 'Masquer le descriptif' : 'Lire le descriptif de l’annonce'}
                </button>
                <div className="emi-volet" data-ouvert={voirDesc}>
                  <div><div className={s.descriptif}>{b.description}</div></div>
                </div>
              </div>
            )}

            {parcours && voirParcours && (
              <div id="emi-fb-parcours">
                <span className={s.rubrique}>Parcours du bien</span>
                <Frise bienId={b.id} />
              </div>
            )}
          </Cascade>
        </div>

        <div className={s.pied}>{pied(b)}</div>
      </section>
    </div>,
    document.body,
  );
}
