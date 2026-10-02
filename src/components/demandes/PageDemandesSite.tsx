'use client';
import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { createPortal } from 'react-dom';
import { addJournal, supabase } from '@/lib/supabase';
import { toutLire } from '@/lib/registre';
import { TYPES_CONTACT, colonneContactAbsente, typeDe, typesDe, type TypeContact } from '@/lib/contacts';
import { signalerEchec, verifie } from '@/lib/ecritures';
import { signalerMaj } from '@/lib/intentions';
import EnteteRubrique, { type Tuile } from '@/components/shared/EnteteRubrique';
import ChoixDate, { texteDate } from '@/components/shared/ChoixDate';
import { Croix, Ic } from '@/components/documents/ApercuActe';
import PictoBoite from './PictoBoite';
import Clients from '@/components/clients/Clients';
import p from '@/components/pages/Page.module.css';
import s from './DemandesSite.module.css';
import {
  CATEGORIES, STATUTS, TABLE_DEMANDES, categorieDe, cleCategorie, correspond, dateLongue, normer, preRemplissage,
  depuis, emailUtile, fourchetteDvf, initiales, jourIso, joliTel, periode, prenomNom, presenter, rappel, rappelDu, resume, robot,
  statutDe, tableAbsente, telUtile,
  type CategorieDemande, type DemandeSite, type PreRemplissage, type StatutDemande,
} from '@/lib/demandes-site';

/* ═══ Demandes du site (V3.34) ════════════════════════════════════════════
   Ce que les formulaires d'emilio-immo.com ont déposé : estimations,
   accompagnements acheteur, demandes d'info sur un bien, messages.

   - En-tête : le statut (Nouvelles, En cours, Traitées, Archivées) — les
     chiffres sont les filtres, comme ailleurs dans le CRM. La rubrique
     s'ouvre toujours sur « Nouvelles », même vide : ce qui arrive d'abord.
   - Dessous : une pastille par formulaire, pour ne voir qu'une catégorie.
   - La liste, par période ; la demande ouverte à droite sur grand écran,
     dans un tiroir sur portable et téléphone.
   - Dans la demande : ses réponses en rubriques (src/lib/demandes-site.ts),
     le statut, une date de rappel, les notes, « Créer le contact » (une
     question, puis la fenêtre Nouveau contact de Contacts, remplie, sans
     quitter la rubrique), archiver, supprimer.

   La table est `contact_submissions` (outils/sql/demandes-site.sql). Le site
   y dépose avec la clé publique, qui ne peut rien lire : c'est le CRM
   connecté qui lit et range. */

type Filtre = 'toutes' | StatutDemande | 'archives';
type Categorie = 'toutes' | CategorieDemande;
type Teinte = { c: string; fond: string; trait: string };

const teinte = (x: Teinte) => ({ '--c': x.c, '--fond': x.fond, '--trait': x.trait } as CSSProperties);
const MARINE: Teinte = { c: '#34496e', fond: '#eef2f8', trait: '#d3dcea' };

const dansFiltre = (d: DemandeSite, f: Filtre) =>
  f === 'archives' ? d.archive : !d.archive && (f === 'toutes' || statutDe(d.statut).k === f);
const dansCategorie = (d: DemandeSite, c: Categorie) => c === 'toutes' || cleCategorie(d) === c;
const pluriel = (n: number, un: string, plusieurs: string) => `${n} ${n > 1 ? plusieurs : un}`;

/* Le grand écran montre la demande à côté de la liste ; en dessous, elle
   s'ouvre dans un tiroir. */
function useGrandEcran() {
  const [grand, setGrand] = useState(false);
  useEffect(() => {
    const m = window.matchMedia('(min-width: 1200px)');
    const maj = () => setGrand(m.matches);
    maj();
    m.addEventListener('change', maj);
    return () => m.removeEventListener('change', maj);
  }, []);
  return grand;
}

/* L'objet du mail, selon ce que le client a demandé. */
function sujetMail(d: DemandeSite): string {
  switch (cleCategorie(d)) {
    case 'estimation': return 'Votre demande d’estimation';
    case 'mandat_recherche': return 'Votre recherche immobilière';
    case 'rappel_bien': return d.property_title ? `Votre demande sur le bien « ${d.property_title} »` : 'Votre demande sur un de nos biens';
    default: return 'Votre message sur emilio-immo.com';
  }
}

export default function PageDemandesSite({ onNavigate }: { onNavigate: (page: string, data?: unknown) => void }) {
  const [demandes, setDemandes] = useState<DemandeSite[]>([]);
  const [charge, setCharge] = useState(true);
  const [erreur, setErreur] = useState<string | null>(null);
  /* La rubrique s'ouvre sur « Nouvelles », même quand il n'y en a aucune :
     c'est ce qu'Alexandre veut voir en arrivant. */
  const [filtre, setFiltre] = useState<Filtre>('nouveau');
  const [cat, setCat] = useState<Categorie>('toutes');
  const [cherche, setCherche] = useState('');
  const [choisie, setChoisie] = useState<string | null>(null);
  const [annonce, setAnnonce] = useState<{ texte: string; annuler?: () => void; action?: string; n: number } | null>(null);
  /* « Créer le contact » : d'abord la question (et les contacts qui lui
     ressemblent), puis la fenêtre Nouveau contact, remplie. */
  const [question, setQuestion] = useState<DemandeSite | null>(null);
  const [creation, setCreation] = useState<{ d: DemandeSite; pre: PreRemplissage } | null>(null);
  const [maintenant, setMaintenant] = useState(() => Date.now());
  const grand = useGrandEcran();
  /* La liste telle qu'elle est à l'écran, pour revenir en arrière si la base
     refuse une modification. */
  const courantes = useRef<DemandeSite[]>([]);
  courantes.current = demandes;
  const premiere = useRef(true);
  /* La colonne (grand écran) ou le tiroir : une autre demande s'ouvre en haut,
     pas à la hauteur où l'on avait laissé la précédente. */
  const cadre = useRef<HTMLDivElement>(null);
  useEffect(() => { cadre.current?.scrollTo({ top: 0 }); }, [choisie]);

  const charger = useCallback(async () => {
    const { data, erreur: e } = await toutLire<DemandeSite>((de, a) =>
      supabase.from(TABLE_DEMANDES).select('*').order('created_at', { ascending: false }).range(de, a));
    setCharge(false);
    setMaintenant(Date.now());
    if (e) { setErreur(e); return; }
    setErreur(null);
    setDemandes(data);
    if (!premiere.current) return;
    premiere.current = false;
    /* Une demande précise dans l'adresse (?page=demandes&demande=<id>) : on
       l'ouvre, dans la liste qui la contient. */
    const voulue = new URLSearchParams(window.location.search).get('demande');
    const d = voulue ? data.find(x => x.id === voulue) : null;
    if (d) { setChoisie(d.id); setFiltre(d.archive ? 'archives' : 'toutes'); }
  }, []);

  useEffect(() => { charger(); }, [charger]);

  /* Une demande peut arriver pendant qu'on regarde : on relit au retour sur
     l'onglet, et chaque minute. */
  useEffect(() => {
    const revoir = () => { if (!document.hidden) charger(); };
    const minuterie = setInterval(revoir, 60_000);
    window.addEventListener('focus', revoir);
    document.addEventListener('visibilitychange', revoir);
    return () => {
      clearInterval(minuterie);
      window.removeEventListener('focus', revoir);
      document.removeEventListener('visibilitychange', revoir);
    };
  }, [charger]);

  /* L'annonce « Demande archivée — Annuler » s'efface d'elle-même. */
  useEffect(() => {
    if (!annonce) return;
    const t = setTimeout(() => setAnnonce(null), annonce.action ? 9000 : 6000);
    return () => clearTimeout(t);
  }, [annonce]);

  /* Le tiroir se ferme avec Échap. */
  useEffect(() => {
    if (grand || !choisie) return;
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setChoisie(null); };
    window.addEventListener('keydown', esc);
    return () => window.removeEventListener('keydown', esc);
  }, [grand, choisie]);

  const f: Filtre = filtre;
  const trouvees = useMemo(() => demandes.filter(d => correspond(d, cherche)), [demandes, cherche]);
  const visibles = trouvees.filter(d => dansFiltre(d, f) && dansCategorie(d, cat));
  const ouverte = demandes.find(d => d.id === choisie) || null;

  /* Les groupes de la liste : aujourd'hui, hier, cette semaine… */
  const groupes = useMemo(() => {
    const out: { titre: string; l: DemandeSite[] }[] = [];
    const now = new Date(maintenant);
    for (const d of visibles) {
      const t = periode(d.created_at, now);
      const g = out[out.length - 1];
      if (g && g.titre === t) g.l.push(d); else out.push({ titre: t, l: [d] });
    }
    return out;
  }, [visibles, maintenant]);

  /* ── Les chiffres ── */
  const actives = demandes.filter(d => !d.archive);
  const nbNouvelles = actives.filter(d => statutDe(d.statut).k === 'nouveau').length;
  const nbRappels = actives.filter(d => statutDe(d.statut).k !== 'traite' && rappelDu(d.a_rappeler_le, new Date(maintenant))).length;
  const derniere = demandes[0];
  const phrase = charge ? undefined
    : erreur ? 'Les demandes n’ont pas pu être lues'
    : demandes.length === 0 ? 'Aucune demande reçue pour l’instant'
    : [
      nbNouvelles ? `${pluriel(nbNouvelles, 'nouvelle demande', 'nouvelles demandes')} à traiter` : 'Tout est traité',
      nbRappels ? `${pluriel(nbRappels, 'rappel', 'rappels')} pour aujourd’hui` : '',
      derniere ? `dernière reçue ${depuis(derniere.created_at, maintenant)}` : '',
    ].filter(Boolean).join(' · ');

  const nbFiltre = (k: Filtre) => trouvees.filter(d => dansFiltre(d, k) && dansCategorie(d, cat)).length;
  const tuiles: Tuile[] = demandes.length === 0 ? [] : [
    { cle: 'toutes', lib: 'Toutes', n: nbFiltre('toutes'), tete: true, ic: <PictoBoite taille={13} epaisseur={2.2} /> },
    { cle: 'nouveau', lib: 'Nouvelles', n: nbFiltre('nouveau'), couleur: '#ef4444', alerte: true },
    { cle: 'en_cours', lib: 'En cours', n: nbFiltre('en_cours'), couleur: '#3b82f6' },
    { cle: 'traite', lib: 'Traitées', n: nbFiltre('traite'), couleur: '#10b981' },
    { cle: 'archives', lib: 'Archivées', n: nbFiltre('archives'), couleur: '#94a3b8' },
  ];
  const nbCat = (c: Categorie) => trouvees.filter(d => dansFiltre(d, f) && dansCategorie(d, c)).length;
  const robots = visibles.filter(robot);

  /* ── Les écritures : l'écran change tout de suite, et revient en arrière
     si la base refuse (le message rouge dit pourquoi). ── */
  const modifier = useCallback(async (id: string, champs: Partial<DemandeSite>, quoi: string) => {
    const avant = courantes.current.find(d => d.id === id);
    setDemandes(l => l.map(d => (d.id === id ? { ...d, ...champs } : d)));
    const ok = await verifie(quoi, supabase.from(TABLE_DEMANDES).update(champs).eq('id', id).select('id'), { ligne: true });
    if (!ok && avant) setDemandes(l => l.map(d => (d.id === id ? avant : d)));
    if (ok) signalerMaj();
    return ok;
  }, []);

  const changerStatut = useCallback((d: DemandeSite, k: StatutDemande) =>
    modifier(d.id, { statut: k, statut_le: new Date().toISOString(), is_called: k === 'traite' }, 'Le statut de la demande'), [modifier]);
  const changerRappel = useCallback((d: DemandeSite, v: string) =>
    modifier(d.id, { a_rappeler_le: v || null }, 'La date de rappel'), [modifier]);
  const enregistrerNote = useCallback((d: DemandeSite, t: string) =>
    modifier(d.id, { admin_notes: t.trim() || null }, 'La note'), [modifier]);

  /* Après avoir rangé une demande, la suivante de la liste s'ouvre (grand
     écran) ; le tiroir, lui, se referme. */
  const suivante = (id: string) => {
    if (!grand) return null;
    const i = visibles.findIndex(x => x.id === id);
    const n = visibles[i + 1] || visibles[i - 1];
    return n && n.id !== id ? n.id : null;
  };

  const archiver = async (d: DemandeSite) => {
    const apres = suivante(d.id);
    if (!(await modifier(d.id, { archive: true, archive_le: new Date().toISOString() }, 'L’archivage de la demande'))) return;
    if (f !== 'archives') setChoisie(apres);
    setAnnonce({ texte: `Demande de ${prenomNom(d.name).prenom || d.name} archivée`, n: Date.now(), annuler: () => { modifier(d.id, { archive: false, archive_le: null }, 'Le retour de la demande'); } });
  };
  const desarchiver = async (d: DemandeSite) => {
    const apres = suivante(d.id);
    if (!(await modifier(d.id, { archive: false, archive_le: null }, 'Le retour de la demande'))) return;
    if (f === 'archives') setChoisie(apres);
    setAnnonce({ texte: 'Demande remise dans la liste', n: Date.now() });
  };

  const supprimer = async (d: DemandeSite) => {
    if (!confirm(`Supprimer définitivement la demande de ${d.name || 'ce contact'} ?\n\nElle disparaît de la base. Pour la garder de côté, utilisez plutôt « Archiver ».`)) return;
    const apres = suivante(d.id);
    if (!(await verifie('La suppression de la demande', supabase.from(TABLE_DEMANDES).delete().eq('id', d.id).select('id'), { ligne: true }))) return;
    setDemandes(l => l.filter(x => x.id !== d.id));
    setChoisie(apres);
    signalerMaj();
    setAnnonce({ texte: 'Demande supprimée', n: Date.now() });
  };

  const supprimerRobots = async () => {
    const l = robots;
    if (!l.length) return;
    const noms = l.slice(0, 6).map(x => `· ${x.name || 'sans nom'}`).join('\n') + (l.length > 6 ? '\n…' : '');
    if (!confirm(`Supprimer ${pluriel(l.length, 'demande qui ressemble', 'demandes qui ressemblent')} à un robot ?\n\n${noms}\n\nElles disparaissent de la base.`)) return;
    const ids = l.map(x => x.id);
    if (!(await verifie('La suppression des demandes de robots', supabase.from(TABLE_DEMANDES).delete().in('id', ids).select('id'), { ligne: true }))) return;
    setDemandes(x => x.filter(d => !ids.includes(d.id)));
    if (choisie && ids.includes(choisie)) setChoisie(null);
    signalerMaj();
    setAnnonce({ texte: `${pluriel(ids.length, 'demande supprimée', 'demandes supprimées')}`, n: Date.now() });
  };

  /* « Créer le contact » : la question d'abord. « Oui » ouvre la fenêtre
     Nouveau contact de Contacts, remplie, par-dessus la rubrique ; une fois
     le contact créé, Contacts relie la demande et la passe « Traitée ». */
  const creerContact = (d: DemandeSite) => setQuestion(d);
  const lancerCreation = (d: DemandeSite) => {
    setQuestion(null);
    setCreation({ d, pre: preRemplissage(d) });
  };
  const finCreation = (d: DemandeSite, clientId: string | null) => {
    setCreation(null);
    if (!clientId) return;
    setDemandes(l => l.map(x => (x.id === d.id ? { ...x, client_id: clientId, statut: 'traite', statut_le: new Date().toISOString(), is_called: true } : x)));
    setAnnonce({ texte: `Contact ${prenomNom(d.name).prenom || d.name} créé`, action: 'Voir sa fiche', annuler: () => { ouvrirFiche(clientId); }, n: Date.now() });
  };
  /* Relier la demande à un contact qui existe déjà.
     V3.50 : le contact prend aussi le type qui va avec la demande (une
     estimation → vendeur, un accompagnement ou une question sur un bien →
     acheteur, comme « Créer le contact »), et la demande s'écrit dans son
     Suivi. Avant, seule la demande changeait : rien sur sa fiche. */
  const relier = async (d: DemandeSite, c: ContactProche) => {
    setQuestion(null);
    if (!(await modifier(d.id, { client_id: c.id, statut: 'traite', statut_le: new Date().toISOString(), is_called: true }, 'Le lien avec le contact'))) return;
    const cat = categorieDe(d.form_type);
    let ajoute: TypeContact | null = null;
    if (cat.type) {
      /* Avant le SQL des types, la colonne manque : tout contact est déjà
         acheteur, il n'y a rien à ajouter. */
      const { data: lu, error: eLu } = await supabase.from('clients').select('types').eq('id', c.id).maybeSingle();
      if (eLu && !colonneContactAbsente(eLu.message)) signalerEchec('Le type du contact', eLu.message);
      else if (lu) {
        const avant = typesDe(lu);
        /* Un « Vendeur signé » qui revend redevient « Vendeur » (comme pour un bien). */
        if (!avant.includes(cat.type)) {
          const apres = TYPES_CONTACT.map(t => t.k).filter(k => k === cat.type || (avant.includes(k) && !(cat.type === 'vendeur' && k === 'vendeur_signe')));
          if (await verifie('Le type du contact', supabase.from('clients').update({ types: apres }).eq('id', c.id).select('id'), { ligne: true })) ajoute = cat.type;
        }
      }
    }
    const pre = preRemplissage(d);
    await addJournal(c.id, 'message_client', `Demande du site · ${cat.lib}`,
      `${pre.notes}${ajoute ? `\n\nType ajouté à sa fiche : ${typeDe(ajoute).lib}.` : ''}`, { demande_site: d.id, formulaire: d.form_type });
    signalerMaj();
    setAnnonce({ texte: `Demande reliée à ${[c.prenom, c.nom].filter(Boolean).join(' ') || 'ce contact'}`, action: 'Voir sa fiche', annuler: () => { ouvrirFiche(c.id); }, n: Date.now() });
  };
  const ouvrirFiche = async (id: string) => {
    const { data, error } = await supabase.from('clients').select('*').eq('id', id).maybeSingle();
    if (error) { signalerEchec('L’ouverture de la fiche', error.message); return; }
    if (!data) { signalerEchec('La fiche du contact', 'ce contact a été supprimé depuis.'); return; }
    onNavigate('fiche', data);
  };
  const voirFiche = (d: DemandeSite) => { if (d.client_id) ouvrirFiche(d.client_id); };

  const choisirFiltre = (k: string) => { setFiltre(k as Filtre); };

  const fiche = ouverte ? (
    <Fiche key={ouverte.id} d={ouverte} maintenant={maintenant}
      onFermer={grand ? undefined : () => setChoisie(null)}
      onStatut={changerStatut} onRappel={changerRappel} onNote={enregistrerNote}
      onArchiver={archiver} onDesarchiver={desarchiver} onSupprimer={supprimer}
      onCreerContact={creerContact} onVoirFiche={voirFiche} />
  ) : null;

  return (
    <div className={p.page}>
      <EnteteRubrique titre="Demandes du site" icone={<PictoBoite />} phrase={phrase}
        recherche={demandes.length > 0 ? { valeur: cherche, onChange: setCherche, placeholder: 'Nom, téléphone, ville, bien…', label: 'Chercher une demande' } : undefined}
        label="Filtrer les demandes par statut" actif={f} onChoisir={choisirFiltre} tuiles={tuiles} />

      {demandes.length > 0 && (
        <div className={s.cats} role="group" aria-label="Filtrer par formulaire">
          <button type="button" aria-pressed={cat === 'toutes'} style={teinte(MARINE)}
            className={`${s.cat} ${cat === 'toutes' ? s.catOn : ''}`} onClick={() => setCat('toutes')}>
            <span className={s.catIc}><PictoBoite taille={14} epaisseur={2.1} /></span>
            <span>Tous</span>
            <span className={s.catN}>{nbCat('toutes')}</span>
          </button>
          {CATEGORIES.map(c => {
            const n = nbCat(c.k);
            return (
              <button key={c.k} type="button" aria-pressed={cat === c.k} style={teinte(c)}
                className={`${s.cat} ${cat === c.k ? s.catOn : ''} ${n === 0 && cat !== c.k ? s.catVide : ''}`}
                onClick={() => setCat(cat === c.k ? 'toutes' : c.k)}>
                <span className={s.catIc}><Ic n={c.ic} t={14} e={2.1} /></span>
                <span>{c.pluriel}</span>
                <span className={s.catN}>{n}</span>
              </button>
            );
          })}
        </div>
      )}

      {charge ? (
        <div className={p.empty}><div className={p.emptySub}>Chargement des demandes…</div></div>
      ) : erreur ? (
        <div className={s.vide}>
          <span className={s.videIc}><PictoBoite taille={26} /></span>
          {tableAbsente(erreur) ? (
            <>
              <div className={s.videTitre}>La table des demandes n’existe pas encore</div>
              <div className={s.videSous}>
                <span>Lancez </span><code>outils/sql/demandes-site.sql</code><span>{' dans Supabase › SQL Editor, puis rechargez la page.'}</span>
              </div>
            </>
          ) : (
            <>
              <div className={s.videTitre}>Les demandes n’ont pas pu être lues</div>
              <div className={s.videSous}>{erreur}</div>
            </>
          )}
          <button type="button" className={s.btn} onClick={() => { setCharge(true); charger(); }}>Réessayer</button>
        </div>
      ) : demandes.length === 0 ? (
        <div className={s.vide}>
          <span className={s.videIc}><PictoBoite taille={26} /></span>
          <div className={s.videTitre}>Aucune demande pour l’instant</div>
          <div className={s.videSous}>Les estimations, les demandes d’accompagnement, les questions sur un bien et les messages laissés sur emilio-immo.com arriveront ici.</div>
        </div>
      ) : (
        <div className={s.zone}>
          <div className={s.liste}>
            {robots.length > 0 && (
              <div className={s.bandeauRobots}>
                <Ic n="alarme" t={17} />
                <span>{`${pluriel(robots.length, 'demande de cette liste ressemble', 'demandes de cette liste ressemblent')} à un robot : nom ou message faits de lettres au hasard.`}</span>
                <button type="button" className={`${s.lienAction} ${s.lienDanger}`} onClick={supprimerRobots}>
                  {robots.length > 1 ? 'Les supprimer' : 'La supprimer'}
                </button>
              </div>
            )}
            {visibles.length === 0 ? (
              <div className={s.vide}>
                <div className={s.videTitre}>{cherche ? 'Aucune demande trouvée' : f === 'nouveau' ? 'Aucune nouvelle demande' : 'Rien dans cette liste'}</div>
                <div className={s.videSous}>
                  {cherche ? `Rien ne correspond à « ${cherche} » ici.` : f === 'nouveau' ? 'Toutes les demandes reçues ont été prises en main.' : 'Changez de statut ou de formulaire pour en voir d’autres.'}
                </div>
              </div>
            ) : groupes.map(g => (
              <div key={g.titre} className={s.groupe}>
                <div className={s.groupeTitre}><span>{g.titre}</span><i>{g.l.length}</i></div>
                {g.l.map((d, i) => (
                  <CarteDemande key={d.id} d={d} on={d.id === choisie} maintenant={maintenant} rang={i}
                    onChoisir={() => setChoisie(d.id === choisie && !grand ? null : d.id)} />
                ))}
              </div>
            ))}
          </div>

          {grand && (
            <aside ref={cadre} className={s.colonne} aria-label="La demande ouverte">
              {fiche || (
                <div className={s.ficheVide}>
                  <span className={s.videIc}><PictoBoite taille={26} /></span>
                  <b>Choisissez une demande</b>
                  <span>Ses réponses, son statut et vos notes s’afficheront ici.</span>
                </div>
              )}
            </aside>
          )}
        </div>
      )}

      {!grand && fiche && typeof document !== 'undefined' && createPortal(
        <>
          <div className={s.voile} onClick={() => setChoisie(null)} aria-hidden="true" />
          <div ref={cadre} className={s.tiroir} role="dialog" aria-modal="true" aria-label={`Demande de ${ouverte?.name || ''}`}>{fiche}</div>
        </>,
        document.body,
      )}

      {question && typeof document !== 'undefined' && createPortal(
        <QuestionContact d={question} onNon={() => setQuestion(null)} onOui={() => lancerCreation(question)} onRelier={c => relier(question, c)} />,
        document.body,
      )}

      {/* La fenêtre Nouveau contact de Contacts, seule, remplie avec la demande. */}
      {creation && <Clients key={creation.d.id} onNavigate={onNavigate} fenetre={{ pre: creation.pre, onFin: id => finCreation(creation.d, id) }} />}

      {annonce && typeof document !== 'undefined' && createPortal(
        <div key={annonce.n} className={s.annonce} role="status">
          <span>{annonce.texte}</span>
          {annonce.annuler && <button type="button" onClick={() => { annonce.annuler?.(); setAnnonce(null); }}>{annonce.action || 'Annuler'}</button>}
        </div>,
        document.body,
      )}
    </div>
  );
}

/* ── Une demande dans la liste ─────────────────────────────────────────── */
function CarteDemande({ d, on, maintenant, rang, onChoisir }: {
  d: DemandeSite; on: boolean; maintenant: number; rang: number; onChoisir: () => void;
}) {
  const cat = categorieDe(d.form_type);
  const st = statutDe(d.statut);
  const neuve = !d.archive && st.k === 'nouveau';
  const r = resume(d);
  const dvf = fourchetteDvf(d);
  const bot = robot(d);
  const rap = !d.archive && st.k !== 'traite' ? rappel(d.a_rappeler_le, new Date(maintenant)) : null;
  return (
    <button type="button" aria-pressed={on} onClick={onChoisir} style={{ ...teinte(cat), animationDelay: `${Math.min(rang, 8) * 25}ms` }}
      className={`${s.carte} ligne-entre ${on ? s.carteOn : ''} ${neuve ? s.carteNeuve : ''} ${bot ? s.carteRobot : ''}`}>
      <span className={s.avatar}>
        {initiales(d.name)}
        {neuve && <span className={s.pointNeuf} title="Nouvelle demande" />}
      </span>
      <span className={s.ligne1}>
        <span className={s.nom}>{d.name || 'Sans nom'}</span>
        <span className={s.pastille}><Ic n={cat.ic} t={12} e={2.2} /><span>{cat.court}</span></span>
      </span>
      <span className={s.quand}>{depuis(d.created_at, maintenant)}</span>
      <span className={`${s.resume} ${r ? '' : s.resumeVide}`}>{r || 'Pas de message'}</span>
      <span className={s.pied}>
        {d.archive
          ? <span className={`${s.pastille} ${s.pastilleRobot}`}>Archivée</span>
          : !neuve && <span className={s.pastille} style={teinte(st)}><span className={s.pointStatut} /><span>{st.lib}</span></span>}
        {rap && (
          <span className={`${s.pastille} ${rap === 'plus_tard' ? s.pastilleRappel : s.pastilleRappelDu}`}>
            <Ic n="alarme" t={12} e={2.2} />
            <span>{rap === 'jour' ? 'À rappeler aujourd’hui' : rap === 'retard' ? `Rappel en retard (${texteDate(d.a_rappeler_le || '', false)})` : `À rappeler le ${texteDate(d.a_rappeler_le || '', false)}`}</span>
          </span>
        )}
        {dvf && <span className={`${s.pastille} ${s.pastilleDvf}`}><Ic n="euro" t={12} e={2.2} /><span>{dvf}</span></span>}
        {d.client_id && <span className={`${s.pastille} ${s.pastilleContact}`}><Ic n="personne" t={12} e={2.2} /><span>Contact créé</span></span>}
        {bot && <span className={`${s.pastille} ${s.pastilleRobot}`}>Robot ?</span>}
        {telUtile(d.phone) && <span className={s.coord}>{joliTel(d.phone)}</span>}
      </span>
    </button>
  );
}

/* ── La demande ouverte ────────────────────────────────────────────────── */
function Fiche({ d, maintenant, onFermer, onStatut, onRappel, onNote, onArchiver, onDesarchiver, onSupprimer, onCreerContact, onVoirFiche }: {
  d: DemandeSite;
  maintenant: number;
  onFermer?: () => void;
  onStatut: (d: DemandeSite, k: StatutDemande) => Promise<boolean>;
  onRappel: (d: DemandeSite, v: string) => Promise<boolean>;
  onNote: (d: DemandeSite, t: string) => Promise<boolean>;
  onArchiver: (d: DemandeSite) => void;
  onDesarchiver: (d: DemandeSite) => void;
  onSupprimer: (d: DemandeSite) => void;
  onCreerContact: (d: DemandeSite) => void;
  onVoirFiche: (d: DemandeSite) => void;
}) {
  const cat = categorieDe(d.form_type);
  const st = statutDe(d.statut);
  const pr = useMemo(() => presenter(d), [d]);
  /* La note se garde en quittant le champ, ou avec « Enregistrer ». La fiche
     est remontée pour chaque demande (key), la note repart donc de la base. */
  const [note, setNote] = useState(d.admin_notes || '');
  const [etatNote, setEtatNote] = useState<'rien' | 'envoi' | 'fait'>('rien');
  const [copie, setCopie] = useState(false);
  const modifiee = note.trim() !== (d.admin_notes || '').trim();

  const garderNote = async () => {
    if (!modifiee || etatNote === 'envoi') return;
    setEtatNote('envoi');
    const ok = await onNote(d, note);
    setEtatNote(ok ? 'fait' : 'rien');
  };

  const tel = telUtile(d.phone) ? joliTel(d.phone) : '';
  const mail = emailUtile(d.email) ? d.email.trim() : '';
  const { prenom } = prenomNom(d.name);
  const lienMail = mail ? `mailto:${mail}?subject=${encodeURIComponent(sujetMail(d))}&body=${encodeURIComponent(`Bonjour${prenom ? ` ${prenom}` : ''},\n\n`)}` : '';
  const copier = async () => {
    try {
      await navigator.clipboard.writeText([d.name, tel, mail].filter(Boolean).join('\n'));
      setCopie(true);
      setTimeout(() => setCopie(false), 1800);
    } catch { signalerEchec('La copie', 'le navigateur a refusé l’accès au presse-papiers.'); }
  };
  const bot = robot(d);
  const aujourdhui = jourIso(new Date(maintenant));

  return (
    <article className={s.fiche} style={teinte(cat)}>
      <header className={s.tete}>
        <div className={s.teteHaut}>
          <span className={s.teteCat}><Ic n={cat.ic} t={14} e={2.1} /><span>{cat.lib}</span></span>
          {onFermer && (
            <button type="button" className={s.fermer} onClick={onFermer} aria-label="Fermer la demande"><Croix t={16} /></button>
          )}
        </div>
        <div className={s.identite}>
          <span className={s.grandAvatar}>{initiales(d.name)}</span>
          <div style={{ minWidth: 0 }}>
            <h2 className={s.grandNom}>{d.name || 'Sans nom'}</h2>
            <div className={s.recue}>{`Reçue le ${dateLongue(d.created_at)} · ${depuis(d.created_at, maintenant).replace(/ /g, '\u00a0')}`}</div>
          </div>
        </div>
        {tel || mail ? (
          <div className={s.contacts}>
            {tel && <a className={`${s.btnClair} ${s.btnOr}`} href={`tel:${tel.replace(/\s/g, '')}`}><Ic n="telephone" t={15} e={2.1} /><span>{tel}</span></a>}
            {mail && <a className={s.btnClair} href={lienMail}><Ic n="mail" t={15} e={2} /><span>Écrire</span></a>}
            <button type="button" className={s.btnClair} onClick={copier}>
              <Ic n={copie ? 'check' : 'copier'} t={15} e={2} /><span>{copie ? 'Copié' : 'Copier'}</span>
            </button>
          </div>
        ) : (
          <div className={s.sansCoord}>Aucun téléphone ni e-mail utilisable dans cette demande.</div>
        )}
        {/* La fiche contact : la créer depuis la demande, ou l'ouvrir. */}
        <div className={s.ficheContact}>
          {d.client_id ? (
            <button type="button" className={s.btnFiche} onClick={() => onVoirFiche(d)}>
              <Ic n="personne" t={16} e={2} /><span>Voir sa fiche contact</span><Ic n="droite" t={15} e={2.2} />
            </button>
          ) : (
            <button type="button" className={s.btnFiche} onClick={() => onCreerContact(d)}>
              <Ic n="plus" t={16} e={2.4} /><span>Créer la fiche contact</span>
            </button>
          )}
        </div>
      </header>

      <div className={s.corps}>
        {bot && (
          <div className={s.robotAvis}>
            <Ic n="alarme" t={18} />
            <span>
              <b>Ça ressemble à un robot.</b>{' '}<span>Le nom ou le message sont faits de lettres au hasard.</span>{' '}
              <button type="button" className={`${s.lienAction} ${s.lienDanger}`} onClick={() => onSupprimer(d)}>Supprimer cette demande</button>
            </span>
          </div>
        )}

        <section className={s.section}>
          <div className={s.sectionTitre}><Ic n="drapeau" t={14} e={2} /><span>Où en est cette demande</span></div>
          <div className={s.statuts} role="radiogroup" aria-label="Statut de la demande">
            {STATUTS.map(x => (
              <button key={x.k} type="button" role="radio" aria-checked={st.k === x.k} style={teinte(x)}
                className={`${s.statut} ${st.k === x.k ? s.statutOn : ''}`}
                onClick={() => { if (st.k !== x.k) onStatut(d, x.k); }}>
                <span className={s.pointStatut} /><span>{x.lib}</span>
              </button>
            ))}
          </div>
          <div className={s.rappel}>
            <b><Ic n="alarme" t={15} e={2} /><span>À rappeler</span></b>
            <ChoixDate compact valeur={d.a_rappeler_le || ''} min={aujourdhui} placeholder="Choisir une date" onChange={v => { if (v) onRappel(d, v); }} />
            {d.a_rappeler_le && <button type="button" className={s.lienAction} onClick={() => onRappel(d, '')}>Retirer</button>}
          </div>
        </section>

        {pr.bien && (() => {
          const contenu = (
            <>
              <span className={s.bienIc}><Ic n="maison" t={19} /></span>
              <span style={{ minWidth: 0 }}>
                <span className={s.bienTitre} style={{ display: 'block' }}>{pr.bien.titre}</span>
                <span className={s.bienRef} style={{ display: 'block' }}>{pr.bien.ref ? `Réf. ${pr.bien.ref}${pr.bien.lien ? ' · voir l’annonce sur le site' : ''}` : 'Bien du site'}</span>
              </span>
              {pr.bien.lien && <span className={s.bienFleche}><Ic n="droite" t={18} e={2.2} /></span>}
            </>
          );
          return pr.bien.lien
            ? <a className={s.bien} href={pr.bien.lien} target="_blank" rel="noopener noreferrer">{contenu}</a>
            : <div className={s.bien}>{contenu}</div>;
        })()}

        {cat.k === 'estimation' && pr.dvf && (
          <div className={`${s.dvf} ${pr.dvf.fourchette ? '' : s.dvfAucune}`}>
            <span className={s.dvfIc}><Ic n="euro" t={19} /></span>
            <div style={{ minWidth: 0 }}>
              <div className={s.dvfLib}>Estimation DVF montrée sur le site</div>
              <div className={s.dvfVal}>{pr.dvf.fourchette || 'Non disponible'}</div>
              <div className={s.dvfSous}>{pr.dvf.ventes ? `D’après ${pluriel(Number(pr.dvf.ventes), 'vente', 'ventes')} autour du bien` : pr.dvf.fourchette ? 'D’après les ventes autour du bien' : 'Pas assez de ventes récentes autour du bien'}</div>
            </div>
          </div>
        )}

        {pr.rubriques.map(r => (
          <section key={r.titre} className={s.section}>
            <div className={s.sectionTitre}><Ic n={r.ic} t={14} e={2} /><span>{r.titre}</span></div>
            {r.champs.length > 0 && (
              <dl className={s.champs}>
                {r.champs.map((c, i) => <div key={i} className={s.champ}><dt>{c.l}</dt><dd>{c.v}</dd></div>)}
              </dl>
            )}
            {!!r.puces?.length && (
              <div className={s.puces}>
                {r.puces.map((x, i) => (
                  <span key={i} className={s.puce}>{r.numerotees && <span className={s.puceN}>{i + 1}</span>}<span>{x}</span></span>
                ))}
              </div>
            )}
          </section>
        ))}

        {pr.message && (
          <section className={s.section}>
            <div className={s.sectionTitre}><Ic n="bulle" t={14} e={2} /><span>Son message</span></div>
            <p className={s.message}>{pr.message}</p>
          </section>
        )}

        <section className={s.section}>
          <div className={s.sectionTitre}><Ic n="personne" t={14} e={2} /><span>Coordonnées</span></div>
          <dl className={s.champs}>
            <div className={s.champ}><dt>Téléphone</dt><dd>{d.phone ? joliTel(d.phone) : '—'}</dd></div>
            <div className={s.champ}><dt>E-mail</dt><dd>{d.email ? `${d.email}${mail ? '' : ' (adresse incomplète)'}` : '—'}</dd></div>
          </dl>
        </section>

        <section className={s.section}>
          <div className={s.sectionTitre}><Ic n="crayon" t={14} e={2} /><span>Mes notes</span></div>
          <textarea className={s.notes} value={note} onBlur={garderNote}
            onChange={e => { setNote(e.target.value); setEtatNote('rien'); }}
            placeholder="Ce qu’il a dit au téléphone, la suite à donner…" aria-label="Mes notes sur cette demande" />
          <div className={s.notesPied}>
            {etatNote === 'fait' && !modifiee
              ? <span className={s.enregistre}><Ic n="check" t={14} e={2.4} /><span>Note enregistrée</span></span>
              : <span className={s.aide}>{modifiee ? 'Enregistrée en quittant le champ' : 'Visibles par vous seul, jamais par le client'}</span>}
            {modifiee && (
              <button type="button" className={`${s.btn} ${s.btnPetit}`} onClick={garderNote} disabled={etatNote === 'envoi'}>
                {etatNote === 'envoi' ? 'Enregistrement…' : 'Enregistrer'}
              </button>
            )}
          </div>
        </section>

        <div className={s.actions}>
          <div className={s.actionsLigne}>
            {d.archive ? (
              <button type="button" className={s.btn} onClick={() => onDesarchiver(d)}>
                <Ic n="haut" t={16} e={2} /><span>Remettre dans la liste</span>
              </button>
            ) : (
              <button type="button" className={s.btn} onClick={() => onArchiver(d)}>
                <Ic n="archive" t={16} e={2} /><span>Archiver</span>
              </button>
            )}
          </div>
          <button type="button" className={`${s.lienAction} ${s.lienDanger} ${s.supprimer}`} onClick={() => onSupprimer(d)}>Supprimer définitivement</button>
        </div>
      </div>
    </article>
  );
}

/* ── « Créer la fiche contact ? » ──────────────────────────────────────────
   La question avant la fenêtre Nouveau contact : ce qui sera repris de la
   demande, et les contacts qui lui ressemblent déjà (même e-mail, même
   téléphone, même nom) — pour relier la demande au lieu de créer un double. */
type ContactProche = { id: string; prenom: string; nom: string; reference: string | null; pourquoi: string };
type LigneContact = { id: string; prenom: string | null; nom: string | null; reference: string | null; emails: string[] | null; telephones: string[] | null };

/* Les 9 derniers chiffres : « 06 12… », « +33 6 12… » et « 0612… » se valent. */
const finTel = (t: unknown) => String(t ?? '').replace(/\D/g, '').slice(-9);

function QuestionContact({ d, onNon, onOui, onRelier }: {
  d: DemandeSite; onNon: () => void; onOui: () => void; onRelier: (c: ContactProche) => void;
}) {
  const pre = useMemo(() => preRemplissage(d), [d]);
  const cat = categorieDe(d.form_type);
  const type = pre.types[0] ? typeDe(pre.types[0]) : null;
  const [proches, setProches] = useState<ContactProche[] | null>(null);

  useEffect(() => {
    let vivant = true;
    (async () => {
      const { data, erreur } = await toutLire<LigneContact>((de, a) =>
        supabase.from('clients').select('id, prenom, nom, reference, emails, telephones').order('id').range(de, a));
      if (!vivant) return;
      if (erreur) { setProches([]); return; }
      const mail = pre.email.toLowerCase();
      const tel = finTel(pre.tel);
      const nom = normer(`${pre.prenom} ${pre.nom}`.trim());
      const nomInverse = normer(`${pre.nom} ${pre.prenom}`.trim());
      const out: ContactProche[] = [];
      for (const c of data) {
        const raisons: string[] = [];
        if (mail && (c.emails || []).some(e => String(e).trim().toLowerCase() === mail)) raisons.push('même e-mail');
        if (tel.length === 9 && (c.telephones || []).some(t => finTel(t) === tel)) raisons.push('même téléphone');
        const n = normer(`${c.prenom || ''} ${c.nom || ''}`.trim());
        if (pre.nom && n && (n === nom || n === nomInverse)) raisons.push('même nom');
        if (raisons.length) out.push({ id: c.id, prenom: c.prenom || '', nom: c.nom || '', reference: c.reference, pourquoi: raisons.join(' · ') });
      }
      setProches(out.slice(0, 4));
    })();
    return () => { vivant = false; };
  }, [pre]);

  useEffect(() => {
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') onNon(); };
    window.addEventListener('keydown', esc);
    return () => window.removeEventListener('keydown', esc);
  }, [onNon]);

  const nomComplet = [pre.prenom, pre.nom].filter(Boolean).join(' ') || d.name || 'Sans nom';
  return (
    <>
      <div className={s.voileQuestion} onClick={onNon} aria-hidden="true" />
      <div className={s.question} role="dialog" aria-modal="true" aria-labelledby="question-contact">
        <div className={s.qTete}>
          <span className={s.qIc}><Ic n="personne" t={20} e={2} /></span>
          <div style={{ minWidth: 0 }}>
            <h3 id="question-contact" className={s.qTitre}>Créer la fiche contact ?</h3>
            <p className={s.qSous}>Ce que le client a donné est repris dans la fenêtre Nouveau contact. Vous le vérifiez avant d’enregistrer, et vous restez ici.</p>
          </div>
        </div>

        <div className={s.qApercu} style={teinte(cat)}>
          <span className={s.avatar} style={{ gridRow: 'auto', marginTop: 0 }}>{initiales(d.name)}</span>
          <div style={{ minWidth: 0 }}>
            <div className={s.qNom}>{nomComplet}</div>
            <div className={s.qPuces}>
              {type
                ? <span className={s.pastille} style={teinte({ c: type.c, fond: type.fond, trait: `${type.c}40` })}><span>{type.lib}</span></span>
                : <span className={`${s.pastille} ${s.pastilleRobot}`}>Type à choisir</span>}
              {pre.tel && <span className={`${s.pastille} ${s.pastilleRobot}`}><Ic n="telephone" t={12} e={2.2} /><span>{pre.tel}</span></span>}
              {pre.email && <span className={`${s.pastille} ${s.pastilleRobot}`}><Ic n="mail" t={12} e={2.2} /><span>{pre.email}</span></span>}
            </div>
            <div className={s.qSource}>{`Source : site, ${pre.source_detail.charAt(0).toLowerCase()}${pre.source_detail.slice(1)} · la demande va dans ses notes${pre.criteres ? ', ses critères dans sa recherche' : ''}`}</div>
          </div>
        </div>

        {proches === null ? (
          <div className={s.qCherche}>{'On regarde s’il est déjà dans vos contacts…'}</div>
        ) : proches.length > 0 && (
          <div className={s.qProches}>
            <div className={s.qProchesTitre}><Ic n="alarme" t={15} e={2} /><span>Déjà dans vos contacts ?</span></div>
            {proches.map(c => (
              <div key={c.id} className={s.qProche}>
                <span style={{ minWidth: 0 }}>
                  <b>{[c.prenom, c.nom].filter(Boolean).join(' ') || 'Sans nom'}</b>
                  <i>{[c.reference, c.pourquoi].filter(Boolean).join(' · ')}</i>
                </span>
                <button type="button" className={`${s.btn} ${s.btnPetit}`} onClick={() => onRelier(c)}>Relier la demande</button>
              </div>
            ))}
          </div>
        )}

        <div className={s.qPied}>
          <button type="button" className={s.btn} onClick={onNon}>Annuler</button>
          {/* V3.50 : pas avant d'avoir regardé s'il existe déjà (un clic
              rapide créait un double). */}
          <button type="button" className={`${s.btn} ${s.btnPlein}`} onClick={onOui} disabled={proches === null}>
            <Ic n="plus" t={16} e={2.4} /><span>{proches === null ? 'Vérification…' : proches.length ? 'Créer quand même' : 'Oui, créer le contact'}</span>
          </button>
        </div>
      </div>
    </>
  );
}
