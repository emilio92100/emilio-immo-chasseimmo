'use client';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { supabase } from '@/lib/supabase';
import EnteteRubrique from '@/components/shared/EnteteRubrique';
import { CATEGORIES, MODELES, STATUTS, aujourdhui, jourLong, modele, electronique, type Categorie, type Statut } from '@/lib/actes';
import { Croix, Ic } from './ApercuActe';
import EditeurDocument from './EditeurDocument';
import NouveauDocument from './NouveauDocument';
import { BlocSignature } from './SignatureEnLigne';
import SignatureSurPlace from './SignatureSurPlace';
import {
  apresAnnulation, apresSignature, colonnesListe, deposer, identiteDuJour, libStatut, lienFichier, mandatDepuis, nomFichier, preparerDepuis, quand, retirerFichiers, tableAbsente,
  type DocumentRow, type MandatRecherche,
} from './outils';
import s from './Documents.module.css';

/* ═══ Documents juridiques ════════════════════════════════════════════════
   La rubrique : les modèles pour en créer un, puis tous les documents,
   filtrés par état (en haut) et par sorte (les pastilles). Un clic ouvre
   sa fiche, à droite, avec ce qu'on peut en faire selon son état.

   Les mandats de recherche en ligne vivent dans la fiche client (ils se
   signent depuis l'espace acheteur) : ils figurent ici aussi, en lecture,
   à côté des mandats de recherche signés sur papier. */

type Item = {
  cle: string;
  categorie: Categorie;
  statut: Statut;
  titre: string;
  sous: string;
  badge: string | null;
  date: string;
  doc?: DocumentRow;
  mandat?: MandatRecherche;
  /* Un courrier : « À envoyer », « Envoyé ». */
  courrier?: boolean;
};

const CAT_IC: Record<string, string> = { mandats_vente: 'maison', mandats_recherche: 'loupe', offres: 'euro', bons_visite: 'calendrier', courriers: 'boucle' };

function itemDoc(d: DocumentRow): Item {
  return {
    cle: d.id, categorie: d.categorie, statut: d.statut, titre: d.titre || 'Document sans titre',
    sous: [d.sous_titre, d.numero ? `N° ${d.numero}` : '',
      d.statut === 'pret' && d.signature ? (d.signature.mode === 'en_ligne' ? 'signature en ligne en cours' : 'signature sur place en cours') : ''].filter(Boolean).join(' · '),
    badge: d.badge, date: d.signe_le || d.finalise_le || d.updated_at, doc: d, courrier: !!modele(d.modele)?.courrier,
  };
}
function itemMandat(x: MandatRecherche, noms: Record<string, string>): Item {
  const nom = [x.mandant?.prenom, x.mandant?.nom].filter(Boolean).join(' ') || (x.client_id ? noms[x.client_id] : '') || 'Client';
  return {
    cle: 'r-' + x.id, categorie: 'mandats_recherche',
    statut: x.retracte_le ? 'annule' : x.statut === 'signe' || x.statut === 'partiel' ? 'signe' : 'pret',
    titre: `Mandat de recherche · ${nom}`, sous: [x.numero ? `N° ${x.numero}` : '', 'signé en ligne', x.statut === 'partiel' ? 'une signature attendue' : ''].filter(Boolean).join(' · '),
    badge: 'En ligne', date: x.retracte_le || x.signe_le || x.created_at, mandat: x,
  };
}

function Pastille({ statut, courrier = false }: { statut: Statut; courrier?: boolean }) {
  const e = STATUTS[statut] || STATUTS.brouillon;
  return <span className={`${s.statut} ${s['t_' + e.ton]}`}>{libStatut(statut, courrier)}</span>;
}

function Ligne({ it, on, onClick }: { it: Item; on: boolean; onClick: () => void }) {
  return (
    <button type="button" className={`${s.ligne} ${on ? s.ligneOn : ''}`} onClick={onClick}>
      <span className={s.ligneIc}><Ic n={CAT_IC[it.categorie] || 'doc'} t={18} /></span>
      <span className={s.ligneTxt}>
        <span className={s.ligneT}>
          <b>{it.titre}</b>
          {it.badge && <span className={s.type}>{it.badge}</span>}
        </span>
        <span className={s.ligneS}>{it.sous || '—'}</span>
        <span className={s.ligneMobile} style={{ display: 'none', marginTop: 6, gap: 8, alignItems: 'center' }}>
          <Pastille statut={it.statut} courrier={it.courrier} /><span style={{ fontSize: 11.5, color: '#94a3b8' }}>{quand(it.date)}</span>
        </span>
      </span>
      <span className={s.ligneMeta}>
        <Pastille statut={it.statut} courrier={it.courrier} />
        <span>{quand(it.date)}</span>
      </span>
    </button>
  );
}

/* ── La fenêtre « Signé » : la date, et l'exemplaire signé (scan ou photo) ── */
function FenetreSigne({ doc, onFermer, onFait }: { doc: DocumentRow; onFermer: () => void; onFait: (d: DocumentRow) => void }) {
  const dejaSigne = doc.statut === 'signe';
  const m = modele(doc.modele);
  const courrier = !!m?.courrier;
  const [jour, setJour] = useState(doc.signe_le ? doc.signe_le.slice(0, 10) : aujourdhui());
  const [fichier, setFichier] = useState<File | null>(null);
  const [travail, setTravail] = useState(false);
  const [erreur, setErreur] = useState('');

  async function valider(sansFichier: boolean) {
    if (!sansFichier && !fichier) { setErreur(courrier ? 'Choisis la preuve d’envoi (accusé, capture de l’e-mail envoyé…).' : 'Choisis le scan ou la photo de l’exemplaire signé.'); return; }
    if (sansFichier && !courrier && !confirm('Marquer signé sans déposer l’exemplaire ?\n\nGarde bien l’original papier : tu pourras déposer le scan plus tard depuis cette fiche.')) return;
    setTravail(true); setErreur('');
    try {
      let chemin = doc.signe_chemin;
      if (fichier) {
        const ext = (fichier.name.split('.').pop() || '').toLowerCase() || (fichier.type === 'application/pdf' ? 'pdf' : 'jpg');
        chemin = await deposer(doc.id, 'signe', fichier, ext);
      }
      const { data, error } = await supabase.from('documents').update({
        statut: 'signe', signe_le: `${jour}T12:00:00Z`, signe_chemin: chemin || null, updated_at: new Date().toISOString(),
      }).eq('id', doc.id).select().single();
      if (error) throw new Error(error.message);
      /* Un mandat de recherche papier remplit le bloc Mandat de sa recherche
         (une seule fois : à la première signature). */
      if (!dejaSigne && m) {
        const pb = await apresSignature(data as DocumentRow, m, jour);
        if (pb) alert(pb);
      }
      onFait(data as DocumentRow);
    } catch (e) {
      setErreur('L’enregistrement a échoué : ' + (e as Error).message);
      setTravail(false);
    }
  }

  return (
    <div className={s.fenetre} onClick={e => { if (e.target === e.currentTarget && !travail) onFermer(); }}>
      <div className={s.fenetreIn} role="dialog" aria-modal="true" aria-label={courrier ? 'Courrier envoyé' : 'Document signé'}>
        <div className={s.fenTete}>
          <div style={{ flex: '1 1 auto' }}>
            <h3>{courrier ? (dejaSigne ? 'Déposer la preuve d’envoi' : 'Le courrier est envoyé') : dejaSigne ? 'Déposer l’exemplaire signé' : 'Le document est signé'}</h3>
            <p>{courrier
              ? 'Garde la preuve de l’envoi avec le courrier : l’accusé du recommandé, ou une capture de l’e-mail envoyé. Elle est facultative, mais c’est elle qui prouve que le client a été prévenu à temps.'
              : m?.surRecherche && m.numero && doc.recherche_id
                ? 'Dépose le scan ou une photo de l’exemplaire signé par tout le monde. Le bloc Mandat de sa recherche se remplit tout seul : son espace ne lui proposera plus de signer en ligne.'
                : m?.surRecherche && doc.recherche_id
                  ? 'Dépose le scan ou une photo de l’exemplaire signé par tout le monde. S’il change la fin du mandat ou les honoraires, sa recherche se met à jour toute seule.'
                  : 'Dépose le scan ou une photo de l’exemplaire signé par tout le monde : il reste ici, rangé avec le document.'}</p>
          </div>
          <button type="button" className={s.panFermer} aria-label="Fermer" onClick={onFermer} disabled={travail}><Croix /></button>
        </div>
        <div className={s.fenCorps}>
          <div className={s.champLigne}>
            <label htmlFor="sg-jour">{courrier ? 'Envoyé le' : 'Signé le'}</label>
            <input id="sg-jour" type="date" className={s.input} value={jour} max={aujourdhui()} onChange={e => setJour(e.target.value)} />
          </div>
          <label className={s.fichier}>
            <input type="file" accept="application/pdf,image/*" onChange={e => setFichier(e.target.files?.[0] || null)} />
            <span className={s.ligneIc}><Ic n="doc" t={18} /></span>
            <span>{fichier ? <><b>{fichier.name}</b>{` · ${Math.max(1, Math.round(fichier.size / 1024))} Ko`}</> : <><b>Choisir le fichier</b>{courrier ? ' (facultatif)' : ' (PDF ou photo)'}</>}</span>
          </label>
          {erreur && <div className={s.erreur}>{erreur}</div>}
        </div>
        <div className={s.fenPied}>
          {!dejaSigne && <button type="button" className={s.btnLien} disabled={travail} onClick={() => valider(true)}>{courrier ? 'Envoyé, sans preuve à déposer' : 'Signé, je déposerai le scan plus tard'}</button>}
          <button type="button" className={`${s.btn} ${s.btnOr}`} disabled={travail} onClick={() => valider(false)}>
            {travail ? 'Enregistrement…' : 'Enregistrer'}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ── La fiche d'un document ── */
function Panneau({ it, noms, docs, onFermer, onEditer, onMaj, onSupprime, onDupliquer, onFiche, onDeriver }: {
  it: Item;
  noms: Record<string, string>;
  /* Tous les documents : pour retrouver les courriers déjà préparés. */
  docs: DocumentRow[];
  onFermer: () => void;
  onEditer: (d: DocumentRow) => void;
  onMaj: (d: DocumentRow) => void;
  onSupprime: (id: string) => void;
  onDupliquer: (d: DocumentRow) => void;
  onFiche: (clientId: string) => void;
  /* Préparer un document à partir d'un mandat (avenant, courrier) : « d-<id> »
     pour un document, « r-<id> » pour un mandat signé en ligne. */
  onDeriver: (cle: string, modeleId: string, o?: { echeance?: string }) => void;
}) {
  const [travail, setTravail] = useState('');
  const [erreur, setErreur] = useState('');
  const [signe, setSigne] = useState(false);
  const [surPlace, setSurPlace] = useState<{ finaliser?: boolean } | null>(null);
  const d = it.doc, x = it.mandat;
  const m = d ? modele(d.modele) : null;
  const courrier = !!m?.courrier;
  /* Signé en ligne ou sur place (et le modèle sait le faire). */
  const elec = !!d && !!m?.cases && electronique(d.donnees);
  const clientId = d?.client_id || x?.client_id || null;
  /* Le courrier de reconduction déjà préparé pour une échéance. */
  const courrierDe = (le: string) => (d ? docs.find(c => c.modele === 'courrier_reconduction' && c.statut !== 'annule'
    && (c.donnees as Record<string, unknown>).sourceId === d.id && (c.donnees as Record<string, unknown>).echeance === le) : undefined);

  useEffect(() => {
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape' && !signe && !surPlace) onFermer(); };
    window.addEventListener('keydown', esc);
    return () => window.removeEventListener('keydown', esc);
  }, [onFermer, signe, surPlace]);

  /* Relu après la signature sur place : le document a pu passer « Signé ». */
  async function recharger() {
    if (!d) return;
    const { data, error } = await supabase.from('documents').select('*').eq('id', d.id).maybeSingle();
    if (error) { setErreur('Le document n’a pas pu être relu : ' + error.message); return; }
    if (data) onMaj(data as DocumentRow);
  }

  async function ouvrirFichier(chemin: string | null | undefined, nom?: string, recherche = false) {
    if (!chemin) return;
    const onglet = window.open('', '_blank');
    setTravail('fichier'); setErreur('');
    try {
      let url: string;
      if (recherche) {
        const { data, error } = await supabase.storage.from('mandats').createSignedUrl(chemin, 300);
        if (error || !data) throw new Error(error?.message || 'fichier introuvable');
        url = data.signedUrl;
      } else url = await lienFichier(chemin, nom);
      if (onglet) onglet.location.href = url; else window.location.href = url;
    } catch (e) {
      onglet?.close();
      setErreur('Le fichier n’a pas pu être ouvert : ' + (e as Error).message);
    }
    setTravail('');
  }

  async function changer(maj: Record<string, unknown>, question: string) {
    if (!d || !confirm(question)) return;
    setTravail('etat'); setErreur('');
    const { data, error } = await supabase.from('documents').update({ ...maj, updated_at: new Date().toISOString() }).eq('id', d.id).select().single();
    setTravail('');
    if (error) { setErreur('Impossible : ' + error.message); return; }
    /* Un mandat de recherche papier signé puis annulé : le bloc Mandat de
       sa recherche se vide. */
    if (maj.statut === 'annule' && m) {
      const pb = await apresAnnulation(d, m);
      if (pb) setErreur(pb);
    }
    onMaj(data as DocumentRow);
  }

  async function supprimer() {
    if (!d || !confirm('Supprimer ce brouillon ?\n\nIl disparaît pour de bon, avec ses réponses.')) return;
    setTravail('supprimer'); setErreur('');
    try {
      await retirerFichiers(d.id);
      const { error } = await supabase.from('documents').delete().eq('id', d.id).eq('statut', 'brouillon');
      if (error) throw new Error(error.message);
      onSupprime(d.id);
    } catch (e) {
      setErreur('La suppression a échoué : ' + (e as Error).message);
      setTravail('');
    }
  }

  const echeances = d && m?.echeances && d.statut === 'signe' && d.signe_le ? m.echeances(d.donnees, d.signe_le.slice(0, 10)) : [];
  const auj = aujourdhui();
  const prochaine = echeances.find(e => e.le >= auj);

  return (
    <>
      <div className={s.voile} onClick={onFermer} aria-hidden="true" />
      <aside className={s.panneau} role="dialog" aria-modal="true" aria-label={it.titre}>
        <div className={s.panTete}>
          <span className={s.ligneIc}><Ic n={CAT_IC[it.categorie] || 'doc'} t={18} /></span>
          <div style={{ minWidth: 0 }}>
            <h3>{it.titre}</h3>
            <p>{it.sous || (m ? m.titre : '')}</p>
            <div style={{ marginTop: 8 }}><Pastille statut={it.statut} courrier={courrier} /></div>
          </div>
          <button type="button" className={s.panFermer} aria-label="Fermer" onClick={onFermer}><Croix /></button>
        </div>

        <div className={s.panCorps}>
          {erreur && <div className={s.erreur}>{erreur}</div>}

          {/* ── Ce qu'on peut en faire ── */}
          {d && (
            <div className={s.actions}>
              {d.statut === 'brouillon' && (
                <button type="button" className={`${s.btn} ${s.btnOr}`} onClick={() => onEditer(d)}>
                  <Ic n="plume" t={16} /><span>Reprendre le brouillon</span>
                </button>
              )}
              {d.statut === 'pret' && elec && (
                <BlocSignature doc={d} onMaj={onMaj} onSurPlace={o => setSurPlace(o || {})} />
              )}
              {d.statut === 'pret' && !elec && (
                <>
                  <button type="button" className={`${s.btn} ${s.btnOr}`} disabled={!!travail} onClick={() => ouvrirFichier(d.pdf_chemin, nomFichier(d))}>
                    <Ic n="doc" t={16} /><span>{courrier ? 'Le PDF à signer et envoyer' : 'Le PDF à imprimer et faire signer'}</span>
                  </button>
                  <button type="button" className={`${s.btn} ${s.btnNavy}`} onClick={() => setSigne(true)}>
                    <Ic n="check" t={16} e={2.4} /><span>{courrier ? 'Il est envoyé' : 'Il est signé : déposer l’exemplaire'}</span>
                  </button>
                </>
              )}
              {d.statut === 'signe' && (d.signe_chemin
                ? <button type="button" className={`${s.btn} ${s.btnOr}`} disabled={!!travail} onClick={() => ouvrirFichier(d.signe_chemin, d.signature ? nomFichier(d, '-signe') : undefined)}><Ic n="doc" t={16} /><span>{courrier ? 'La preuve d’envoi' : d.signature ? 'L’exemplaire signé et scellé' : 'L’exemplaire signé'}</span>{d.signature && <small>avec son certificat</small>}</button>
                : <button type="button" className={`${s.btn} ${courrier ? '' : s.btnOr}`} onClick={() => setSigne(true)}><Ic n="doc" t={16} /><span>{courrier ? 'Déposer la preuve d’envoi' : 'Déposer l’exemplaire signé'}</span><small>pas encore déposé{courrier ? 'e' : ''}</small></button>)}
              {d.statut === 'signe' && d.modele === 'mandat_vente' && (
                <button type="button" className={s.btn} onClick={() => onDeriver('d-' + d.id, 'avenant_vente')}>
                  <Ic n="plume" t={16} /><span>Préparer un avenant</span><small>prix, honoraires, durée</small>
                </button>
              )}
              {d.statut === 'signe' && d.modele === 'mandat_recherche' && (
                <button type="button" className={s.btn} onClick={() => onDeriver('d-' + d.id, 'avenant_recherche')}>
                  <Ic n="plume" t={16} /><span>Préparer un avenant</span><small>budget, recherche, durée</small>
                </button>
              )}
              {d.statut === 'signe' && d.signature && <BlocSignature doc={d} onMaj={onMaj} onSurPlace={() => {}} />}
              {(d.statut === 'signe' || d.statut === 'annule') && d.pdf_chemin && (
                <button type="button" className={s.btn} disabled={!!travail} onClick={() => ouvrirFichier(d.pdf_chemin, nomFichier(d))}><Ic n="doc" t={16} /><span>Le PDF d’origine</span></button>
              )}
              {d.statut !== 'brouillon' && (
                <button type="button" className={s.btn} onClick={() => onEditer(d)}><Ic n="loupe" t={16} /><span>{d.statut === 'pret' ? 'Ouvrir (ou le modifier)' : 'Relire le document'}</span></button>
              )}
              <button type="button" className={s.btn} onClick={() => onDupliquer(d)}>
                <Ic n="doc" t={16} /><span>Dupliquer</span><small>nouveau brouillon</small>
              </button>
              {d.statut === 'brouillon' && (
                <button type="button" className={`${s.btn} ${s.btnDanger}`} disabled={!!travail} onClick={supprimer}><Croix t={15} /><span>Supprimer le brouillon</span></button>
              )}
              {(d.statut === 'pret' || d.statut === 'signe') && (
                <button type="button" className={`${s.btn} ${s.btnDanger}`} disabled={!!travail}
                  onClick={() => changer({ statut: 'annule', annule_le: new Date().toISOString() },
                    d.statut === 'signe'
                      ? `Marquer ce document comme annulé (rétractation, fin du mandat…) ?\n\nIl reste dans la liste, avec ses fichiers.${m?.surRecherche && m.numero && d.recherche_id ? '\n\nLe bloc Mandat de sa recherche sera vidé.' : ''}`
                      : 'Annuler ce document ?\n\nIl reste dans la liste, avec son PDF, marqué « Annulé ».')}>
                  <Croix t={15} /><span>{d.statut === 'signe' ? 'Marquer annulé' : 'Annuler le document'}</span>
                </button>
              )}
            </div>
          )}

          {x && (
            <div className={s.actions}>
              {x.pdf_chemin && x.statut === 'signe' && (
                <button type="button" className={`${s.btn} ${s.btnOr}`} disabled={!!travail} onClick={() => ouvrirFichier(x.pdf_chemin, undefined, true)}>
                  <Ic n="doc" t={16} /><span>Le mandat signé</span>
                </button>
              )}
              {(x.statut === 'signe' || x.statut === 'partiel') && !x.retracte_le && (
                <button type="button" className={s.btn} onClick={() => onDeriver('r-' + x.id, 'avenant_recherche')}>
                  <Ic n="plume" t={16} /><span>Préparer un avenant</span><small>budget, recherche, durée</small>
                </button>
              )}
              <div className={s.note}>Le mandat de recherche se prépare et se fait signer depuis la fiche du client (bloc Mandat) : il se signe en ligne, dans son espace.</div>
            </div>
          )}

          {clientId && (
            <button type="button" className={s.btn} onClick={() => onFiche(clientId)} style={{ justifyContent: 'flex-start' }}>
              <Ic n="personne" t={16} /><span>{`Fiche client : ${noms[clientId] || 'ouvrir'}`}</span>
            </button>
          )}

          {/* ── Les échéances d'un mandat signé ── */}
          {echeances.length > 0 && (
            <div className={s.carte}>
              <div className={s.carteT}>Les échéances</div>
              {echeances.map((e, i) => {
                const passee = e.le < auj;
                const maintenant = !!e.du && !!e.au && e.du <= auj && auj <= e.au;
                const rate = !!e.au && e.au < auj && !passee;
                const lettre = e.du && e.au && !passee ? courrierDe(e.le) : undefined;
                /* Le courrier se prépare pour la prochaine échéance seulement. */
                const aPreparer = !lettre && !!e.du && !!e.au && e === prochaine;
                return (
                  <div key={i} className={`${s.echeance} ${passee ? s.echeancePassee : ''}`}>
                    <span className={`${s.point} ${e === prochaine ? s.pointOr : ''}`} />
                    <span>
                      <b>{jourLong(e.le)}</b>{` · ${e.quoi}`}
                      {e.du && e.au && <i>{`Écrire au ${m?.categorie === 'mandats_recherche' ? 'client' : 'vendeur'} entre le ${jourLong(e.du)} et le ${jourLong(e.au)}.`}</i>}
                      {maintenant && <i className={s.echeanceMaintenant}>C’est maintenant : envoie-lui le courrier ou l’e-mail.</i>}
                      {rate && !lettre && <i className={s.echeanceRatee}>Délai passé : sans ce courrier, le client pourra arrêter le mandat à tout moment après l’échéance.</i>}
                      {lettre && <button type="button" className={s.btnLien} style={{ marginTop: 6 }} onClick={() => onEditer(lettre)}>{`Courrier : ${libStatut(lettre.statut, true).toLowerCase()}${lettre.signe_le ? ` le ${jourLong(lettre.signe_le.slice(0, 10))}` : ''} · l’ouvrir`}</button>}
                      {aPreparer && <button type="button" className={s.btnLien} style={{ marginTop: 6 }} onClick={() => onDeriver('d-' + d!.id, 'courrier_reconduction', { echeance: e.le })}>Préparer le courrier</button>}
                    </span>
                  </div>
                );
              })}
              <i className={s.chAide}>{`Article L215-1 du Code de la consommation : avant chaque prolongation, le ${m?.categorie === 'mandats_recherche' ? 'client' : 'vendeur'} est prévenu par écrit, au plus tôt trois mois et au plus tard un mois avant.`}</i>
            </div>
          )}

          {/* ── Les informations ── */}
          <div className={s.carte}>
            <div className={s.carteT}>Informations</div>
            <dl className={s.infos}>
              {m && <><dt>Modèle</dt><dd>{m.titre}{d?.badge ? ` · ${d.badge}` : ''}</dd></>}
              {(d?.numero || x?.numero) && <><dt>N° registre</dt><dd>{d?.numero || x?.numero}</dd></>}
              {d && <><dt>Créé</dt><dd>{quand(d.created_at)}</dd></>}
              {d?.statut === 'brouillon' && <><dt>Modifié</dt><dd>{quand(d.updated_at)}</dd></>}
              {d?.finalise_le && <><dt>Finalisé</dt><dd>{quand(d.finalise_le)}</dd></>}
              {(d?.signe_le || x?.signe_le) && <><dt>{courrier ? 'Envoyé' : 'Signé'}</dt><dd>{jourLong(String(d?.signe_le || x?.signe_le).slice(0, 10))}</dd></>}
              {x?.retracte_le && <><dt>Rétracté</dt><dd>{quand(x.retracte_le)}</dd></>}
              {d?.annule_le && <><dt>Annulé</dt><dd>{quand(d.annule_le)}</dd></>}
              {m && <><dt>{courrier ? 'Signature' : 'Signataires'}</dt><dd>{m.signataires}</dd></>}
            </dl>
          </div>
        </div>
      </aside>
      {signe && d && <FenetreSigne doc={d} onFermer={() => setSigne(false)} onFait={r => { setSigne(false); onMaj(r); }} />}
      {surPlace && d && <SignatureSurPlace doc={d} finaliser={!!surPlace.finaliser} onFermer={() => { setSurPlace(null); void recharger(); }} />}
    </>
  );
}

/* Ce que la page doit faire en s'ouvrant, venue d'un autre écran. */
export type IntentionDocuments = { avenantRecherche?: string };

export default function PageDocuments({ onNavigate, intention, onIntention }: {
  onNavigate: (page: string, data?: unknown) => void;
  intention?: IntentionDocuments | null;
  onIntention?: () => void;
}) {
  const [docs, setDocs] = useState<DocumentRow[] | null>(null);
  const [mandats, setMandats] = useState<MandatRecherche[]>([]);
  const [noms, setNoms] = useState<Record<string, string>>({});
  const [erreur, setErreur] = useState('');
  const [absente, setAbsente] = useState(false);
  const [statut, setStatut] = useState('tout');
  const [cat, setCat] = useState<'tout' | Categorie>('tout');
  const [cherche, setCherche] = useState('');
  const [ouvert, setOuvert] = useState<string | null>(null);
  const [nouveau, setNouveau] = useState<{ modele?: string } | null>(null);
  const [edition, setEdition] = useState<DocumentRow | null>(null);

  const charger = useCallback(async () => {
    const [a, b] = await Promise.all([
      supabase.from('documents').select('*').order('updated_at', { ascending: false }).limit(500),
      supabase.from('mandats_signatures').select('id, numero, statut, signe_le, retracte_le, pdf_chemin, client_id, recherche_id, mandant, created_at')
        .order('created_at', { ascending: false }).limit(300),
    ]);
    if (a.error) {
      if (tableAbsente(a.error.message)) setAbsente(true);
      else setErreur('Les documents n’ont pas pu être lus : ' + a.error.message);
      setDocs([]);
    } else { setDocs((a.data || []) as DocumentRow[]); setAbsente(false); setErreur(''); }
    const ms = b.error ? [] : ((b.data || []) as MandatRecherche[]);
    setMandats(ms);
    const ids = Array.from(new Set([...(a.data || []).map(x => (x as DocumentRow).client_id), ...ms.map(x => x.client_id)].filter((x): x is string => !!x)));
    if (ids.length) {
      const { data } = await supabase.from('clients').select('id, prenom, nom').in('id', ids.slice(0, 300));
      setNoms(Object.fromEntries((data || []).map(c => [c.id as string, `${c.prenom || ''} ${c.nom || ''}`.trim()])));
    }
  }, []);
  useEffect(() => { charger(); }, [charger]);

  const items = useMemo<Item[]>(() => [
    ...(docs || []).map(itemDoc),
    ...mandats.filter(x => x.statut === 'signe' || x.statut === 'partiel' || x.retracte_le || x.statut === 'en_cours').map(x => itemMandat(x, noms)),
  ].sort((p, q) => q.date.localeCompare(p.date)), [docs, mandats, noms]);

  const q = cherche.trim().toLowerCase();
  const cherches = useMemo(() => items.filter(it => !q || `${it.titre} ${it.sous} ${it.badge || ''}`.toLowerCase().includes(q)), [items, q]);
  const dansCat = cherches.filter(it => cat === 'tout' || it.categorie === cat);
  const visibles = dansCat.filter(it => statut === 'tout' || it.statut === statut);
  const n = (st: string) => dansCat.filter(it => it.statut === st).length;
  const aSigner = items.filter(it => it.statut === 'pret' && it.doc && !it.courrier).length;
  const aEnvoyer = items.filter(it => it.statut === 'pret' && it.courrier).length;

  const majDoc = useCallback((r: DocumentRow) => {
    setDocs(l => (l ? (l.some(x => x.id === r.id) ? l.map(x => (x.id === r.id ? r : x)) : [r, ...l]) : [r]));
  }, []);

  async function dupliquer(d: DocumentRow) {
    const m = modele(d.modele);
    if (!m) return;
    const donnees = { ...d.donnees, date: aujourdhui(), ...(m.numero ? { numero: '' } : {}) };
    const { data, error } = await supabase.from('documents').insert({
      modele: d.modele, categorie: d.categorie, statut: 'brouillon', donnees, ...colonnesListe(m, donnees),
      client_id: d.client_id, bien_id: d.bien_id, recherche_id: d.recherche_id,
    }).select().single();
    if (error) { alert('La copie n’a pas pu être créée.\n\n' + error.message); return; }
    majDoc(data as DocumentRow);
    setOuvert(null);
    setEdition(data as DocumentRow);
  }

  /* Un avenant ou un courrier, à partir d'un mandat (« d-<id> » : un
     document ; « r-<id> » : un mandat signé en ligne) : repris, créé en
     brouillon, ouvert. */
  const deriver = useCallback(async (cle: string, modeleId: string, o: { echeance?: string } = {}) => {
    const m = modele(modeleId);
    if (!m?.deriver) return;
    try {
      const [identite, src] = await Promise.all([identiteDuJour(), mandatDepuis(cle)]);
      const donnees = await preparerDepuis(m, src, identite, o);
      const { data, error } = await supabase.from('documents').insert({
        modele: m.id, categorie: m.categorie, statut: 'brouillon', donnees, ...colonnesListe(m, donnees),
        client_id: src.client_id, bien_id: src.bien_id, recherche_id: src.recherche_id,
      }).select().single();
      if (error) throw new Error(error.message);
      majDoc(data as DocumentRow);
      setOuvert(null);
      setEdition(data as DocumentRow);
    } catch (e) {
      alert('Le document n’a pas pu être préparé.\n\n' + (e as Error).message);
    }
  }, [majDoc]);

  /* Venu d'ailleurs (la fiche client : « Préparer un avenant ») : le mandat
     signé de cette recherche, en ligne d'abord, sinon sur papier. */
  const faite = useRef('');
  useEffect(() => {
    const rid = intention?.avenantRecherche;
    if (!rid || faite.current === rid) return;
    faite.current = rid;
    (async () => {
      /* Un avenant déjà en route pour cette recherche : on l'ouvre, plutôt
         que d'en préparer un second. */
      const enCours = await supabase.from('documents').select('*').eq('recherche_id', rid).eq('modele', 'avenant_recherche')
        .in('statut', ['brouillon', 'pret']).order('created_at', { ascending: false }).limit(1);
      const deja = !enCours.error && enCours.data?.length ? (enCours.data[0] as DocumentRow) : null;
      if (deja) {
        onIntention?.();
        majDoc(deja);
        if (deja.statut === 'brouillon') setEdition(deja); else setOuvert(deja.id);
        return;
      }
      const [a, b] = await Promise.all([
        supabase.from('mandats_signatures').select('id').eq('recherche_id', rid).in('statut', ['signe', 'partiel'])
          .order('signe_le', { ascending: false }).limit(1),
        supabase.from('documents').select('id').eq('recherche_id', rid).eq('modele', 'mandat_recherche').eq('statut', 'signe')
          .order('signe_le', { ascending: false }).limit(1),
      ]);
      const cle = a.data?.length ? 'r-' + a.data[0].id : b.data?.length ? 'd-' + b.data[0].id : '';
      onIntention?.();
      /* Pas de mandat signé dans le CRM (saisi à la main, signé ailleurs) :
         la fenêtre « Nouveau document » s'ouvre sur l'avenant, pour le
         retrouver ou tout saisir. */
      if (!cle) { setNouveau({ modele: 'avenant_recherche' }); return; }
      await deriver(cle, 'avenant_recherche');
    })();
  }, [intention, onIntention, deriver, majDoc]);

  async function ficheClient(id: string) {
    const { data, error } = await supabase.from('clients').select('*').eq('id', id).maybeSingle();
    if (error || !data) { alert('La fiche du client n’a pas pu être ouverte.' + (error ? `\n\n${error.message}` : '')); return; }
    onNavigate('fiche', data);
  }

  const itOuvert = ouvert ? items.find(it => it.cle === ouvert) || null : null;
  const nbCat = (c: string) => cherches.filter(it => it.categorie === c).length;

  return (
    <div className={s.page}>
      <EnteteRubrique titre="Documents juridiques" icone={<Ic n="doc" t={22} />}
        phrase={aSigner + aEnvoyer > 0
          ? [aSigner ? `${aSigner} document${aSigner > 1 ? 's' : ''} à faire signer` : '', aEnvoyer ? `${aEnvoyer} courrier${aEnvoyer > 1 ? 's' : ''} à envoyer` : ''].filter(Boolean).join(' · ')
          : 'Mandats, avenants, offres d’achat, bons de visite : prêts à imprimer et à signer.'}
        recherche={items.length > 0 ? { valeur: cherche, onChange: setCherche, placeholder: 'Chercher un nom, une adresse, un numéro…', label: 'Chercher un document' } : undefined}
        bouton={absente ? undefined : { lib: 'Nouveau document', onClick: () => setNouveau({}) }}
        label="Filtrer par état" actif={statut} onChoisir={setStatut}
        tuiles={items.length === 0 ? [] : [
          { cle: 'tout', lib: 'Tous', n: dansCat.length },
          { cle: 'brouillon', lib: 'Brouillons', n: n('brouillon'), couleur: '#94a3b8' },
          { cle: 'pret', lib: 'À faire signer', n: n('pret'), couleur: '#3b82f6', alerte: true },
          { cle: 'signe', lib: 'Signés', n: n('signe'), couleur: '#10b981' },
          { cle: 'annule', lib: 'Annulés', n: n('annule'), couleur: '#ef4444' },
        ]} />

      {absente && (
        <div className={s.erreur}>
          <b>Une étape avant de commencer</b>
          La table des documents n’existe pas encore. Ouvre Supabase › SQL Editor, colle le contenu du fichier <code>outils/sql/documents.sql</code>, lance-le, puis recharge cette page.
        </div>
      )}
      {erreur && <div className={s.erreur}>{erreur}</div>}

      {/* ── Les modèles ── */}
      {!absente && (
        <section className={s.bloc}>
          <div className={s.blocT}><h2>Créer un document</h2><span>Le texte s’écrit à partir de tes réponses</span></div>
          <div className={s.modeles}>
            {MODELES.map(m => (
              <button key={m.id} type="button" className={s.modele} onClick={() => setNouveau({ modele: m.id })}>
                <span className={s.modeleIc}><Ic n={m.ic} t={20} /></span>
                <div>
                  <b>{m.titre}</b>
                  <p>{m.description}</p>
                </div>
                <span className={s.modeleAction}>Créer<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M5 12h14" /><path d="m13 6 6 6-6 6" /></svg></span>
              </button>
            ))}
            <div className={`${s.modele} ${s.modeleInfo}`}>
              <span className={s.modeleIc}><Ic n="loupe" t={20} /></span>
              <div>
                <b>Mandat de recherche en ligne</b>
                <p>Simple : il se prépare depuis la fiche du client et se signe dans son espace, seul, à plusieurs ou pour une société. Les mandats signés apparaissent ici, et leurs avenants se préparent d’ici ou depuis la fiche.</p>
                <small className={s.modeleNote}>Depuis la fiche client, signé en ligne</small>
              </div>
            </div>
          </div>
        </section>
      )}

      {/* ── Les documents ── */}
      {items.length > 0 && (
        <nav className={s.cats} aria-label="Sortes de documents">
          <button type="button" className={`${s.cat} ${cat === 'tout' ? s.catOn : ''}`} onClick={() => setCat('tout')}>Tout <i>{cherches.length}</i></button>
          {CATEGORIES.map(c => (
            <button key={c.id} type="button" className={`${s.cat} ${cat === c.id ? s.catOn : ''}`} onClick={() => setCat(c.id)}>
              <Ic n={CAT_IC[c.id]} t={14} />{c.titre}<i>{nbCat(c.id)}</i>
            </button>
          ))}
        </nav>
      )}

      {docs === null ? (
        <div className={s.liste}><div className={s.vide}>Chargement…</div></div>
      ) : !absente && (
        <div className={s.liste}>
          {visibles.length === 0 ? (
            <div className={s.vide}>
              <b>{items.length === 0 ? 'Aucun document pour l’instant' : 'Rien ici'}</b>
              {items.length === 0 ? 'Choisis un modèle ci-dessus : le brouillon s’enregistre tout seul, au fil de la saisie.' : 'Aucun document ne correspond à ces filtres.'}
            </div>
          ) : visibles.map(it => <Ligne key={it.cle} it={it} on={ouvert === it.cle} onClick={() => setOuvert(it.cle)} />)}
        </div>
      )}

      {/* Les fenêtres vivent sur <body> : l'écran qui les contient est animé
          (transform), et un élément fixe s'y retrouverait prisonnier. */}
      {typeof document !== 'undefined' && createPortal(<>
      {itOuvert && (
        <Panneau it={itOuvert} noms={noms} docs={docs || []} onDeriver={deriver} onFermer={() => setOuvert(null)}
          onEditer={d => { setOuvert(null); setEdition(d); }}
          onMaj={majDoc}
          onSupprime={id => { setDocs(l => (l || []).filter(x => x.id !== id)); setOuvert(null); }}
          onDupliquer={dupliquer}
          onFiche={ficheClient} />
      )}
      {nouveau && (
        <NouveauDocument modeleId={nouveau.modele} onFermer={() => setNouveau(null)}
          onCree={r => { majDoc(r); setNouveau(null); setEdition(r); }} />
      )}
      {edition && <EditeurDocument doc={edition} onMaj={majDoc} onFermer={() => { setEdition(null); charger(); }}
        onFinalise={r => { majDoc(r); setEdition(null); setOuvert(r.id); }} />}
      </>, document.body)}
    </div>
  );
}
