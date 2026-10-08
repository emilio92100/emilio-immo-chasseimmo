'use client';
import { Fragment, useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import { euros } from '@/lib/mandat';
import { liste, num, txt } from '@/lib/actes';
import {
  argentBien, avantMandat, controleAnnonce, etapeDe, etapesDuBien, etageTexte, lirePieces, lirePhotos, m2, nomType, permisBien, pourcent, texteEstimation, titreBien,
  type BienVente, type ChampBien as TChamp, type Donnees, type EtapeBien, type EtapeVente, type SuiviVente,
} from '@/lib/biens-vente';
import { Ic } from '@/components/documents/ApercuActe';
import { ChampBien, habitable, manquesBien, proprioOuvert } from './ChampsBien';
import { PICTO_BLOC, PICTO_ETAPE, Picto, aUnDessin, teinte } from './Pictos';
import { ajouterSuivi, bienVide, biensSemblables, enregistrerBien, supprimerBien, type BienSemblable } from './outils';
import s from '@/components/documents/Documents.module.css';
import b from './Biens.module.css';

/* ═══ L'éditeur d'un bien ═════════════════════════════════════════════════
   Plein écran, comme celui des documents. V3.108 (la maquette « A1 »
   choisie par Alexandre) : à gauche le sommaire, les parties rangées par
   thème avec ce qui reste à faire ; au milieu les questions, partie par
   partie ou tout sur une page, en blocs dessinés, les choix en vignettes
   (ChampsBien, Pictos) ; à droite « La fiche, en direct » et ce que
   l'annonce doit encore dire. Plus de « carte dans la liste » (« je suis
   pas fan »). Au téléphone, le sommaire devient un menu en haut, et deux
   onglets : Questions / Aperçu.

   Les étapes suivent l'étape de vente : tout ce qui décrit le bien se
   remplit dès « à suivre » (V3.15), les indications de visite (clés,
   codes) aussi depuis la V3.16 ; seuls l'estimation et le prix attendent
   l'étape « estimation ». Ouvert sur une
   étape qui n'existe pas encore, l'éditeur dit pourquoi.

   Tout s'enregistre seul, 0,8 s après la dernière frappe. */

type Enreg = 'ok' | 'attente' | 'encours' | { erreur: string };

/* Les questions d'une étape, en blocs : un bloc par titre de section. Les
   pièces, les photos, le dossier ont déjà leurs propres cartes : pas de cadre. */
const SANS_CADRE = ['pieces', 'photos', 'dossier'];
const PRIX_FIGES = ['prix', 'charge', 'honoMode', 'taux', 'forfait'];
type Groupe = { titre: Extract<TChamp, { t: 'titre' }> | null; champs: TChamp[] };
function groupes(champs: TChamp[], d: Donnees): Groupe[] {
  const out: Groupe[] = [];
  for (const c of champs) {
    /* Un titre masqué (« L'immeuble » pour une maison) ne coupe pas : ses
       questions restent sous le titre d'avant (« La construction »). */
    if (c.t === 'titre') { if (!c.si || c.si(d)) out.push({ titre: c, champs: [] }); continue; }
    if (!out.length) out.push({ titre: null, champs: [] });
    out[out.length - 1].champs.push(c);
  }
  const vu = (c: TChamp) => !c.si || c.si(d);
  return out.filter(g => (!g.titre || vu(g.titre)) && g.champs.some(vu));
}

/* ── Le sommaire (V3.108) ──
   Les parties rangées comme sur la maquette A1 : le vendeur, le bien, ce
   qui est pour lui seul, la vente. Chacune dit où elle en est : une coche
   verte (remplie, rien d'obligatoire ne manque), le nombre de choses à
   compléter, ou « à faire » (pas encore commencée). */
const GROUPES_SOMMAIRE = [
  { titre: 'Le vendeur', ids: ['proprio'] },
  { titre: 'Le bien', ids: ['bien', 'interieur', 'exterieur', 'pieces', 'energie', 'copro'] },
  { titre: 'Pour toi seul', ids: ['observations'] },
  { titre: 'La vente', ids: ['prix', 'pratique', 'annonce', 'photos'] },
];
const NOMS_PARTIES: Record<string, string> = {
  proprio: 'Le propriétaire', bien: 'Le bien', interieur: 'L’intérieur', exterieur: 'Extérieur et annexes', pieces: 'Les pièces',
  energie: 'L’énergie', copro: 'Copro et charges', observations: 'Les observations', prix: 'Prix et mandat',
  pratique: 'Indications de visite', annonce: 'L’annonce', photos: 'Photos et dossier',
};
/* Avant le mandat, « Prix et mandat » s'appelle « Estimation » (etapesDuBien). */
const nomPartie = (e: EtapeBien) => (e.id === 'prix' && e.court === 'Estimation' ? 'L’estimation' : NOMS_PARTIES[e.id] || e.court);
const COULEURS_PARTIES: Record<string, [string, string]> = {
  proprio: ['#34496e', '#eef2f8'], bien: ['#a07c28', '#fbf6e9'], interieur: ['#2d5c8f', '#eaf1fa'], exterieur: ['#15803d', '#ecf8f0'],
  pieces: ['#475569', '#f1f5f9'], energie: ['#b45309', '#fff4e5'], copro: ['#0f766e', '#e8f7f5'], observations: ['#6d28d9', '#f3effd'],
  prix: ['#8a6a1f', '#fbf4e1'], pratique: ['#0e7490', '#e7f6fa'], annonce: ['#9d174d', '#fcebf3'], photos: ['#4338ca', '#eef0fd'],
};

/* Ce qui compte pour « rempli à x % » : une réponse qu'on attend. Les textes
   libres, les cases (« ce qu'il y a » peut rester vide), le dossier et les
   observations n'en sont pas. */
const plein = (x: unknown): boolean => (typeof x === 'number' ? Number.isFinite(x)
  : typeof x === 'string' ? !!x.trim()
    : Array.isArray(x) ? x.length > 0
      : typeof x === 'boolean' ? x
        : !!x && typeof x === 'object' && Object.keys(x).length > 0);
const visible = (c: TChamp, d: Donnees) => !c.si || c.si(d);
const ATTENDUS = ['choix', 'texte', 'nombre', 'euros', 'date', 'compteur', 'lettres', 'adresse', 'eurosAn', 'pieces', 'photos', 'annonce', 'proprio'];
function repondu(c: TChamp, d: Donnees): boolean {
  if (c.t === 'pieces') return lirePieces(d.detailPieces).length > 0;
  if (c.t === 'photos') return lirePhotos(d.photos).length > 0;
  if (c.t === 'annonce') return plein(d.annonceTexte);
  if (c.t === 'proprio') return proprioOuvert(d);
  return plein(d[c.cle]);
}
function remplissage(etapes: EtapeBien[], d: Donnees): number {
  let n = 0, ok = 0;
  for (const e of etapes) for (const c of e.champs) {
    if (!ATTENDUS.includes(c.t) || !visible(c, d)) continue;
    n++;
    if (repondu(c, d)) ok++;
  }
  return n ? Math.round((ok / n) * 100) : 0;
}
/* Une partie commencée : au moins une réponse, quelle qu'elle soit. */
const commencee = (e: EtapeBien, d: Donnees) => e.champs.some(c => c.t !== 'titre' && visible(c, d) && (ATTENDUS.includes(c.t) ? repondu(c, d) : plein(d[c.cle])));
type EtatPartie = { n: number; ok: boolean };

function ListeParties({ etapes, cur, etats, onAller }: { etapes: EtapeBien[]; cur: number; etats: EtatPartie[]; onAller: (i: number) => void }) {
  const groupes = GROUPES_SOMMAIRE
    .map(g => ({ titre: g.titre, l: g.ids.map(id => etapes.findIndex(e => e.id === id)).filter(i => i >= 0) }))
    .filter(g => g.l.length);
  const restes = etapes.map((_, i) => i).filter(i => !GROUPES_SOMMAIRE.some(g => g.ids.includes(etapes[i].id)));
  if (restes.length) groupes.push({ titre: 'Autres', l: restes });
  return (
    <nav className={b.sommListe} aria-label="Les parties du bien">
      {groupes.map(g => (
        <div key={g.titre} className={b.sommGr}>
          <div className={b.sommGrT}>{g.titre}</div>
          {g.l.map(i => {
            const e = etapes[i];
            const x = etats[i];
            const [coul, fond] = COULEURS_PARTIES[e.id] || ['#34496e', '#eef2f8'];
            return (
              <button key={e.id} type="button" className={b.sommL} aria-current={i === cur ? 'step' : undefined} onClick={() => onAller(i)}>
                <span className={b.sommIc} style={{ background: fond, color: coul }}><Ic n={e.ic} t={16} /></span>
                <span className={b.sommNom}>{nomPartie(e)}</span>
                {x.n > 0
                  ? <span className={b.sommN} title={`${x.n} information${x.n > 1 ? 's' : ''} à compléter`}>{x.n}</span>
                  : x.ok
                    ? <span className={b.sommOk} title="Remplie"><Ic n="check" t={11} e={3} /></span>
                    : <span className={b.sommVide}>à faire</span>}
              </button>
            );
          })}
        </div>
      ))}
    </nav>
  );
}

function Sommaire({ etapes, cur, etats, pct, sous, onAller }: { etapes: EtapeBien[]; cur: number; etats: EtatPartie[]; pct: number; sous: string; onAller: (i: number) => void }) {
  return (
    <div className={b.sommCarte}>
      <div className={b.sommTete}>
        <div className={b.sommTitre}><b>Le sommaire</b><span className={b.sommPct}>{`${pct} % rempli`}</span></div>
        <div className={b.sommJauge} aria-hidden="true"><i style={{ width: `${pct}%` }} /></div>
        {sous && <div className={b.sommSous}>{sous}</div>}
      </div>
      <ListeParties etapes={etapes} cur={cur} etats={etats} onAller={onAller} />
    </div>
  );
}

/* Au téléphone et sur une tablette : le sommaire en menu, en haut. */
function SommaireMenu({ etapes, cur, etats, pct, ouvert, onBasculer, onAller }: {
  etapes: EtapeBien[]; cur: number; etats: EtatPartie[]; pct: number; ouvert: boolean; onBasculer: () => void; onAller: (i: number) => void;
}) {
  const e = etapes[cur];
  const x = etats[cur];
  const p = PICTO_ETAPE[e.id];
  return (
    <div className={b.sommMenu}>
      <button type="button" className={b.sommBtn} aria-expanded={ouvert} onClick={onBasculer}>
        <span className={b.sommBtnImg}>{aUnDessin(p) ? <Picto n={p} t={30} /> : <Ic n={e.ic} t={18} />}</span>
        <span className={b.sommBtnTxt}>{`${cur + 1} sur ${etapes.length} · ${nomPartie(e)}`}</span>
        {x.n > 0 && <span className={b.sommN}>{x.n}</span>}
        <svg className={b.sommChev} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m6 9 6 6 6-6" /></svg>
      </button>
      <div className={b.sommBarre}>
        <div className={b.sommJauge} aria-hidden="true"><i style={{ width: `${pct}%` }} /></div>
        <span className={b.sommPct}>{`${pct} % rempli`}</span>
      </div>
      {ouvert && (
        <>
          <button type="button" className={b.sommVoile} aria-label="Fermer le sommaire" onClick={onBasculer} />
          <div className={b.sommPanneau}>
            <ListeParties etapes={etapes} cur={cur} etats={etats} onAller={onAller} />
          </div>
        </>
      )}
    </div>
  );
}

/* `anime` : en « étape par étape », l'étape qui arrive glisse en place,
   ses blocs l'un après l'autre (V3.16). */
function BlocEtape({ e, i, n, d, maj, bienId, manques = 0, anime = false, sens = 1 }: { e: EtapeBien; i: number; n: number; d: Donnees; maj: (cle: string, v: unknown) => void; bienId: string; manques?: number; anime?: boolean; sens?: 1 | -1 }) {
  const champProprio = e.champs.find(c => c.t === 'proprio') || null;
  const reste = champProprio ? e.champs.filter(c => c !== champProprio) : e.champs;
  const verrou = !!champProprio && !proprioOuvert(d);
  const nouveau = d.proprioNouveau === true && !txt(d, 'clientId');
  /* V3.48 : sous offre, sous compromis, vendu, le prix et les honoraires ne se
     changent plus ici (« Changer le prix » garde l'historique et prévient les
     acheteurs) ; vendus, ils sont ceux de l'acte. */
  const fige = permisBien({ etape: String(d._stade || '') as EtapeVente }).prixFige && e.champs.some(c => PRIX_FIGES.includes(c.cle));
  /* V3.108 : la partie a son dessin, en grand, dans une carte blanche. */
  const pe = PICTO_ETAPE[e.id];
  return (
    <section className={`${s.etape} ${b.etape} ${anime ? b.etapeEntre : ''}`} data-etape={e.id} style={anime ? { ['--sens' as string]: sens } as React.CSSProperties : undefined}>
      <div className={b.etapeTeteA1}>
        <span className={`${b.etapeImg} ${b.etapeIcVif}`} style={{ background: teinte(pe || '') }}>{aUnDessin(pe) ? <Picto n={pe} t={48} /> : <Ic n={e.ic} t={24} />}</span>
        <div className={b.etapeTeteTxt}>
          <div className={s.etapeN}>{`Partie ${i + 1} sur ${n}`}</div>
          <h2 className={s.etapeT}>{e.titre}</h2>
          <p className={s.etapeS}>{e.sous}</p>
        </div>
        {manques > 0 && <span className={b.etapeManque}>{`${manques} à compléter`}</span>}
      </div>
      {/* « Le propriétaire » (V3.29) : d'abord sa fiche client, à part ; la
          suite reste grisée tant qu'elle n'est ni trouvée ni à créer, puis
          s'ouvre sur fond clair pour une fiche nouvelle. */}
      {champProprio && <ChampBien c={champProprio} d={d} maj={maj} off={false} bienId={bienId} />}
      {fige && <div className={b.verrouMot}><Ic n="cadenas" t={14} />{d._stade === 'vendu' ? 'Le bien est vendu : le prix et les honoraires sont ceux de l’acte.' : 'Le prix et les honoraires se changent avec « Changer le prix », sur la fiche : l’ancien reste dans l’historique.'}</div>}
      {champProprio && verrou && <div className={b.verrouMot}><Ic n="cadenas" t={14} />La suite s’ouvre dès que le propriétaire est choisi, créé, ou laissé pour plus tard.</div>}
      <div className={verrou ? b.suiteVerrou : champProprio && nouveau ? b.suiteNouveau : b.suite} inert={verrou || undefined} aria-disabled={verrou || undefined}>
        {groupes(reste, d).map((g, k) => {
          const pb = g.titre ? PICTO_BLOC[g.titre.cle] : undefined;
          return (
          <div key={g.titre?.cle || k} className={!g.titre && g.champs.every(c => SANS_CADRE.includes(c.t)) ? b.sectNu : `${b.sect} ${b.sectA1}`} data-sect={g.titre?.cle || undefined}
            style={anime ? { ['--k' as string]: k } as React.CSSProperties : undefined}>
            {g.titre && (
              <div className={b.sectTete}>
                <span className={b.sectImg} style={{ background: teinte(pb || '') }}>{aUnDessin(pb) ? <Picto n={pb} t={38} /> : <Ic n={g.titre.ic || 'plus'} t={18} />}</span>
                <div><b>{g.titre.lib}</b>{g.titre.aide && <small>{g.titre.aide}</small>}</div>
              </div>
            )}
            <div className={s.grille}>
              {/* Une même clé peut avoir deux libellés selon le type (« etages » :
                  les niveaux d'une maison, les étages d'un immeuble). */}
              {g.champs.map(c => <Fragment key={`${c.cle}:${"lib" in c ? c.lib : ""}`}><ChampBien c={c} d={d} maj={maj} off={fige && PRIX_FIGES.includes(c.cle)} bienId={bienId} /></Fragment>)}
            </div>
          </div>
          );
        })}
      </div>
    </section>
  );
}

/* ── À droite : « La fiche, en direct » (V3.108) ──
   Ce qu'on retiendra du bien, au fil de la saisie : son nom, son prix et
   ses honoraires, ses faits en pastilles, quelques chiffres. Puis, une fois
   le mandat signé, ce que l'annonce doit encore dire, chaque manque avec
   un lien vers sa partie. Avant (V3.108 aussi), la carte « dans la liste »
   était là : Alexandre n'en voulait plus. */
function Apercu({ bien, d, ids, nbPhotos, onAller, onMasquer }: { bien: BienVente; d: Donnees; ids: string[]; nbPhotos: number; onAller: (id: string) => void; onMasquer?: () => void }) {
  const a = argentBien(d);
  const surf = num(d, 'carrez') || num(d, 'surface');
  const pieces = lirePieces(d.detailPieces);
  const total = pieces.filter(p => habitable(p)).reduce((t, p) => t + (p.surface || 0), 0);
  const charges = num(d, 'chargesAn');
  const taxe = num(d, 'taxeFonciere');
  const avant = avantMandat(bien.etape);
  const aSuivre = bien.etape === 'a_suivre';
  const lieu = [txt(d, 'adresse'), txt(d, 'ville')].filter(Boolean).join(', ');
  /* Les faits, dans l'ordre où on les dit au téléphone. */
  const annexes = liste(d, 'annexes');
  const nbP = num(d, 'pieces'), nbCh = num(d, 'chambres'), etage = num(d, 'etage');
  const faits = [
    num(d, 'surface') ? m2(num(d, 'surface') as number) : '',
    nbP ? `${nbP} pièce${nbP > 1 ? 's' : ''}` : '',
    nbCh ? `${nbCh} chambre${nbCh > 1 ? 's' : ''}` : '',
    etage !== null && d.typeBien !== 'maison' ? `${etageTexte(etage)}${liste(d, 'immeuble').includes('ascenseur') ? ', ascenseur' : ''}` : '',
    num(d, 'terrain') ? `Terrain ${m2(num(d, 'terrain') as number)}` : '',
    typeof d.dpe === 'string' && d.dpe ? `DPE ${d.dpe}` : '',
    annexes.includes('balcon') ? `Balcon${num(d, 'surfBalcon') ? ` ${m2(num(d, 'surfBalcon') as number)}` : ''}` : '',
    annexes.includes('terrasse') ? `Terrasse${num(d, 'surfTerrasse') ? ` ${m2(num(d, 'surfTerrasse') as number)}` : ''}` : '',
    annexes.includes('jardin') ? `Jardin${num(d, 'surfJardin') ? ` ${m2(num(d, 'surfJardin') as number)}` : ''}` : '',
    annexes.includes('cave') ? 'Cave' : '',
    annexes.some(x => ['parking', 'box', 'garage'].includes(x)) ? 'Parking' : '',
  ].filter(Boolean);
  /* Ce que l'annonce doit dire (la loi), plus son texte et des photos. */
  const ctrl = [
    ...controleAnnonce(d),
    { ok: plein(d.annonceTexte), l: 'Le texte de l’annonce', ou: 'annonce' },
    { ok: nbPhotos > 0, l: 'Des photos', ou: 'photos' },
  ];
  return (
    <div className={b.apercu}>
      <section className={b.direct} aria-label="La fiche, en direct">
        <div className={b.directTete}>
          <span className={b.directT}>La fiche, en direct</span>
          {onMasquer && (
            <button type="button" className={b.directMasquer} onClick={onMasquer} title="Masquer la fiche en direct : les questions prennent la place">
              <Ic n="oeilBarre" t={14} /><span>Masquer</span>
            </button>
          )}
        </div>
        <div className={b.directNom}>
          <b>{d.typeBien ? titreBien(d) : 'Nouveau bien'}</b>
          {lieu && <span>{lieu}</span>}
        </div>
        {aSuivre
          ? <div className={b.directSans}>Le prix viendra à l’estimation.</div>
          : a.prix
            ? (
              <div>
                <span className={b.directPrixL}>{avant ? 'Prix conseillé' : 'Prix affiché'}</span>
                <div className={b.directPrix}>{euros(a.prix)}</div>
                {a.hono !== null && <div className={b.directHono}>{`Honoraires ${a.taux ? `${pourcent(a.taux)} ` : ''}TTC à la charge ${a.acq ? 'de l’acquéreur' : 'du vendeur'}${a.net ? ` · net vendeur ${euros(a.net)}` : ''}`}</div>}
              </div>
            )
            : <div className={b.directSans}>Pas encore de prix.</div>}
        {faits.length > 0 && <div className={b.directFaits}>{faits.map(f => <span key={f}>{f}</span>)}</div>}
        {(a.prix && surf) || charges || taxe ? (
          <div className={b.directLignes}>
            {a.prix && surf ? <div><span>Prix au m²</span><b>{euros(a.prix / surf)}</b></div> : null}
            {charges ? <div><span>Charges de copropriété</span><b>{`${euros(charges / 12)} / mois`}</b></div> : null}
            {taxe ? <div><span>Taxe foncière</span><b>{`${euros(taxe)} / an`}</b></div> : null}
          </div>
        ) : null}
      </section>
      {!avant && (
        <section className={b.publier}>
          <h3 className={b.publierT}>Pour publier l’annonce</h3>
          {ctrl.map(x => (
            <div key={x.l} className={b.publierL}>
              {x.ok
                ? <span className={b.publierOk}><Ic n="check" t={11} e={3} /></span>
                : <span className={b.publierKo} aria-hidden="true">!</span>}
              <span className={b.publierTxt}>{x.l}</span>
              {!x.ok && x.ou && ids.includes(x.ou) && <button type="button" className={b.publierLien} onClick={() => onAller(x.ou as string)}>{NOMS_COURTS[x.ou] || 'Y aller'}</button>}
            </div>
          ))}
        </section>
      )}
      {pieces.length > 0 && (
        <div className={b.bloc}>
          <div className={b.blocT}><span className={b.blocIc}><Ic n="plan" t={15} /></span><h3>{`Les pièces · ${pieces.length}`}</h3></div>
          <div className={b.tags}>{pieces.map(p => <span key={p.id} className={b.tag}>{`${p.nom || '…'}${p.surface ? ` · ${m2(p.surface)}` : ''}`}</span>)}</div>
          {total > 0 && <div className={b.pied}>{`Surface habitable : ${m2(total)}`}</div>}
        </div>
      )}
    </div>
  );
}
/* Le lien d'un manque de l'annonce, vers sa partie. */
const NOMS_COURTS: Record<string, string> = { prix: 'Prix', bien: 'Le bien', energie: 'Énergie', copro: 'Copro', annonce: 'Annonce', photos: 'Photos' };

const NOTICES: Record<string, { t: string; x: string }> = {
  prix: { t: 'Le prix se donne à l’estimation', x: 'Ce bien est « à suivre » : décris-le autant que tu veux, tout est ouvert. La fourchette et le prix conseillé viendront quand tu le passeras en estimation, avec le bouton d’étape de sa fiche.' },
};
function Notice({ id, onFermer }: { id: string; onFermer: () => void }) {
  const n = NOTICES[id] || { t: 'Cette partie s’ouvrira plus tard', x: 'Elle dépend de l’étape de vente du bien.' };
  return (
    <div className={b.notice} role="status">
      <Ic n="info" t={18} />
      <div><b>{n.t}</b>{n.x}</div>
      <button type="button" onClick={onFermer} aria-label="Fermer">✕</button>
    </div>
  );
}

/* V3.50 : un nouveau bien qui en double un autre (même adresse, ou un
   propriétaire qui a déjà un bien en cours) : on le dit pendant la saisie,
   avec « Ouvrir la fiche existante » ou « C'est un autre bien ». */
function Semblables({ l, onOuvrir, onIgnorer }: { l: BienSemblable[]; onOuvrir: (id: string) => void; onIgnorer: (id: string) => void }) {
  return (
    <div className={`${b.ventile} ${b.ventileManque}`} role="status" style={{ marginBottom: 14 }}>
      <Ic n="info" t={16} />
      <span>
        <b>{l.length > 1 ? 'Ces biens existent peut-être déjà :' : 'Ce bien existe peut-être déjà :'}</b>
        {l.map(x => (
          <span key={x.bien.id} style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8, marginTop: 6 }}>
            <span>{`${x.pourquoi === 'adresse' ? 'Même adresse' : 'Même propriétaire'} : ${[x.bien.titre || titreBien(x.bien.donnees || {}), x.bien.adresse || x.bien.ville || '', etapeDe(x.bien.etape).court + (x.bien.archive ? ', archivé' : ''), x.bien.reference || ''].filter(Boolean).join(' · ')}`}</span>
            <button type="button" className={b.lien} onClick={() => onOuvrir(x.bien.id)}>Ouvrir la fiche existante</button>
            <button type="button" className={b.lien} onClick={() => onIgnorer(x.bien.id)}>{x.pourquoi === 'adresse' ? 'C’est un autre bien : continuer' : 'Un autre bien à lui : continuer'}</button>
          </span>
        ))}
      </span>
    </div>
  );
}

export default function EditeurBien({ bien, etapeDepart: depart, nouveau = false, autres, vus = [], onOuvrirExistant, onMaj, onFermer }: {
  bien: BienVente;
  etapeDepart?: string;
  nouveau?: boolean;
  /* V3.50 : les autres biens (un nouveau bien seulement), pour les doublons ;
     `vus` : ceux déjà montrés avant la création (« Créer quand même »). */
  autres?: BienVente[]; vus?: string[]; onOuvrirExistant?: (id: string) => void;
  /* Plus lus depuis la V3.108 (ils servaient à la carte « dans la liste »),
     gardés pour ne pas toucher aux appels. */
  suivi: SuiviVente[];
  nbAcheteurs: number;
  nbVisites?: number; nbPrevues?: number; nbCR?: number;
  nbOffres?: number;
  onMaj: (b: BienVente) => void;
  /* null : le bien, créé puis laissé vide, a été supprimé. */
  onFermer: (b: BienVente | null) => void;
}) {
  const [row, setRow] = useState<BienVente>(bien);
  const [d, setD] = useState<Donnees>(() => ({ ...(bien.donnees || {}) }));
  /* Les étapes du formulaire pour cette étape de vente. */
  const ETAPES = useMemo(() => etapesDuBien(row.etape), [row.etape]);
  /* « bien:t-surf » (V3.45) : l'étape « Le bien », ouverte sur « Les surfaces ».
     Alexandre : « Modifier » des surfaces renvoyait au début du formulaire.
     « interieur:@vitrage » (V3.107) : droit sur un champ, depuis une ligne
     d'une carte de la fiche. */
  /* V3.109 : sans « : » (« exterieur », le « Modifier » d'une carte), la
     partie est une chaîne vide, pas `undefined` — en « tout sur une page »,
     le `startsWith` plus bas cassait, et la page restait en haut. */
  const [etapeDepart = '', sectDepart = ''] = (depart || '').split(':');
  const [etape, setEtape] = useState(() => Math.max(0, etapesDuBien(bien.etape).findIndex(e => e.id === etapeDepart)));
  /* Le sens du dernier pas (V3.80) : l'étape arrive de la droite ou de la gauche. */
  const [sens, setSens] = useState<1 | -1>(1);
  /* « Modifier » d'un bloc qui n'est pas encore ouvert à cette étape de
     vente (le prix d'un bien à suivre) : on le dit, au lieu d'ouvrir
     ailleurs sans un mot. */
  const [notice, setNotice] = useState<string | null>(() => (etapeDepart && !etapesDuBien(bien.etape).some(e => e.id === etapeDepart) ? etapeDepart : null));
  const [vue, setVue] = useState<'form' | 'apercu'>('form');
  const [mode, setMode] = useState<'etapes' | 'tout'>(() => {
    try { return localStorage.getItem('biens.mode') === 'tout' ? 'tout' : 'etapes'; } catch { return 'etapes'; }
  });
  const choisirMode = (x: 'etapes' | 'tout') => {
    setMode(x);
    try { localStorage.setItem('biens.mode', x); } catch { /* sans mémoire, tant pis */ }
  };
  /* V3.130 (Alexandre : « soit cacher la fiche en direct, soit la mettre sur
     le côté ») : sur ordinateur, « Masquer » la replie en une languette à
     droite, qui la rouvre. Le choix est gardé d'un bien à l'autre. Au
     téléphone, rien ne change : elle reste sous l'onglet « Aperçu ». */
  const [apercuCache, setApercuCache] = useState(() => {
    try { return localStorage.getItem('biens.apercu') === 'cache'; } catch { return false; }
  });
  const montrerApercu = (oui: boolean) => {
    setApercuCache(!oui);
    try { localStorage.setItem('biens.apercu', oui ? 'vu' : 'cache'); } catch { /* sans mémoire, tant pis */ }
  };
  const [enreg, setEnreg] = useState<Enreg>('ok');
  const formRef = useRef<HTMLDivElement>(null);
  const [ignores, setIgnores] = useState<string[]>(vus);

  /* ── L'enregistrement automatique ── */
  const dernier = useRef<Donnees>(d);
  /* Ce que la base avait, vu d'ici (V3.43) : seules les réponses changées
     depuis partent, les autres (la tablette, une signature) restent. */
  const vu = useRef<Donnees>({ ...(bien.donnees || {}) });
  const minuterie = useRef<ReturnType<typeof setTimeout> | null>(null);
  const enVol = useRef<Promise<boolean> | null>(null);
  const aEnregistrer = useRef(false);
  /* La ligne la plus fraîche, pour la fermeture (V3.48) : l'état `row` n'est
     pas encore à jour juste après un enregistrement. */
  const rowRef = useRef(row);

  const enregistrer = useCallback(async (): Promise<boolean> => {
    if (enVol.current) await enVol.current;
    if (!aEnregistrer.current) return true;
    /* V3.50 : la fourchette, comme dans les fenêtres de l'estimation. Rien ne
       part tant qu'elle est à l'envers (l'écran le dit, la saisie reste). */
    const dx = dernier.current;
    /* Seulement quand la fourchette vient d'être touchée : une fourchette déjà
       à l'envers en base (d'avant) ne doit pas bloquer les photos ou la
       description d'un bien où elle n'est même pas affichée. */
    const touchee = dx.estimBasse !== vu.current.estimBasse || dx.estimHaute !== vu.current.estimHaute;
    if (touchee && typeof dx.estimBasse === 'number' && typeof dx.estimHaute === 'number' && dx.estimBasse > 0 && dx.estimHaute > 0 && dx.estimBasse > dx.estimHaute) {
      setEnreg({ erreur: 'La fourchette basse est au-dessus de la haute.' });
      return false;
    }
    aEnregistrer.current = false;
    const donnees = dernier.current;
    setEnreg('encours');
    const p = (async () => {
      try {
        const r = await enregistrerBien(row.id, donnees, vu.current);
        vu.current = donnees;
        rowRef.current = r;
        setRow(r); onMaj(r);
        setEnreg(aEnregistrer.current ? 'attente' : 'ok');
        return true;
      } catch (e) {
        aEnregistrer.current = true;
        setEnreg({ erreur: (e as Error).message });
        return false;
      }
    })();
    enVol.current = p;
    const ok = await p;
    enVol.current = null;
    return ok;
  }, [row.id, onMaj]);

  const maj = useCallback((cle: string, v: unknown) => {
    setD(prev => {
      const n = { ...prev, [cle]: typeof v === 'function' ? (v as (avant: unknown) => unknown)(prev[cle]) : v };
      dernier.current = n;
      return n;
    });
    aEnregistrer.current = true;
    setEnreg('attente');
    if (minuterie.current) clearTimeout(minuterie.current);
    minuterie.current = setTimeout(() => { enregistrer(); }, 800);
  }, [enregistrer]);

  useEffect(() => {
    const avant = (e: BeforeUnloadEvent) => { if (aEnregistrer.current) { e.preventDefault(); e.returnValue = ''; } };
    window.addEventListener('beforeunload', avant);
    return () => window.removeEventListener('beforeunload', avant);
  }, []);
  useEffect(() => () => { if (minuterie.current) clearTimeout(minuterie.current); }, []);

  /* Échap ferme, comme une fenêtre. */
  const fermerRef = useRef<() => void>(() => {});
  /* V3.108 : au téléphone, le sommaire s'ouvre en menu ; Échap le ferme d'abord. */
  const [menu, setMenu] = useState(false);
  const menuRef = useRef(false);
  menuRef.current = menu;
  useEffect(() => {
    const esc = (e: KeyboardEvent) => { if (e.key !== 'Escape') return; if (menuRef.current) setMenu(false); else fermerRef.current(); };
    window.addEventListener('keydown', esc);
    return () => window.removeEventListener('keydown', esc);
  }, []);

  /* V3.48 : un enregistrement en cours est attendu avant de fermer. Avant,
     fermer pendant qu'il partait ne l'attendait pas : s'il échouait, rien ne
     le disait, et la saisie était perdue. */
  async function vider(): Promise<boolean> {
    if (minuterie.current) clearTimeout(minuterie.current);
    if (enVol.current) await enVol.current;
    if (!aEnregistrer.current) return true;
    return enregistrer();
  }

  /* V3.50 : une estimation revue dans l'éditeur (la fourchette, le prix
     conseillé avant le mandat) laisse UNE ligne dans l'historique du bien, à
     la fermeture — avant et après —, comme « Revoir l'estimation ». Pas une
     par frappe. */
  const estimDepart = useRef({ basse: num(bien.donnees || {}, 'estimBasse'), haute: num(bien.donnees || {}, 'estimHaute'), prix: num(bien.donnees || {}, 'prix') });
  async function noterEstimation() {
    const x = dernier.current;
    const avantM = avantMandat(rowRef.current.etape);
    const a = estimDepart.current;
    const n = { basse: num(x, 'estimBasse'), haute: num(x, 'estimHaute'), prix: avantM ? num(x, 'prix') : a.prix };
    if (n.basse === a.basse && n.haute === a.haute && n.prix === a.prix) return;
    estimDepart.current = n;
    const deja = !!(a.basse || a.haute || (avantM && a.prix));
    const p = avantM ? n.prix : null, pa = avantM ? a.prix : null;
    try {
      await ajouterSuivi({ bien_id: row.id, type: 'note',
        commentaire: `${texteEstimation({ basse: n.basse, haute: n.haute, prix: p })}${deja ? ` (avant : ${texteEstimation({ basse: a.basse, haute: a.haute, prix: pa }).replace(/^Estimation : /, '')})` : ''}`,
        donnees: { estimation: true, basse: n.basse, haute: n.haute, prix: p, ...(deja ? { avant: { basse: a.basse, haute: a.haute, prix: pa } } : {}), depuis: 'editeur' } });
    } catch (e) { setEnreg({ erreur: `L’estimation est enregistrée, mais pas sa ligne d’historique : ${(e as Error).message}` }); }
  }

  async function fermer() {
    const ok = await vider();
    if (nouveau && bienVide(dernier.current)) {
      try { await supprimerBien({ ...row, donnees: dernier.current }); onFermer(null); return; } catch { /* on le garde */ }
    }
    if (!ok && !confirm('La dernière modification n’a pas pu être enregistrée.\n\nFermer quand même ?')) return;
    if (ok) await noterEstimation();
    onFermer(rowRef.current);
  }
  fermerRef.current = () => { void fermer(); };

  async function terminer() {
    const ok = await vider();
    if (!ok) return;
    if (nouveau && bienVide(dernier.current)) { await fermer(); return; }
    await noterEstimation();
    onFermer(rowRef.current);
  }

  /* Les données vues par les questions : avec l'étape de vente (`_stade`),
     jamais enregistrée, pour effacer ce qui ne sert pas encore. */
  const dv = useMemo(() => ({ ...d, _stade: row.etape }), [d, row.etape]);
  const dd = useDeferredValue(d);
  const semblables = useMemo(() => (nouveau && autres ? biensSemblables(dd, autres, row.id, ignores) : []), [nouveau, autres, dd, row.id, ignores]);
  /* Ouvrir la fiche existante : le bien commencé ici est retiré (après accord
     s'il contient déjà quelque chose). */
  async function ouvrirExistant(id: string) {
    if (!onOuvrirExistant) return;
    if (minuterie.current) clearTimeout(minuterie.current);
    if (enVol.current) await enVol.current;
    if (!bienVide(dernier.current) && !confirm('Ouvrir la fiche existante ?\n\nLe bien commencé ici est supprimé, avec ce que tu y as déjà saisi.')) return;
    try { await supprimerBien({ ...rowRef.current, donnees: dernier.current }); }
    catch (e) { setEnreg({ erreur: (e as Error).message }); return; }
    aEnregistrer.current = false;
    onOuvrirExistant(id);
  }
  const manquesParEtape = useMemo(() => ETAPES.map(e => manquesBien(e.champs, dv)), [ETAPES, dv]);

  const suivreDefilement = useCallback(() => {
    if (mode !== 'tout' || !formRef.current) return;
    const zone = formRef.current;
    const haut = zone.getBoundingClientRect().top + 140;
    const blocs = Array.from(zone.querySelectorAll<HTMLElement>('[data-etape]'));
    let i = 0;
    blocs.forEach((x, k) => { if (x.getBoundingClientRect().top <= haut) i = k; });
    if (zone.scrollTop + zone.clientHeight >= zone.scrollHeight - 4) i = blocs.length - 1;
    setEtape(i);
  }, [mode]);

  /* Ouvert sur une étape précise (« Modifier » d'un bloc de la fiche), en
     mode « tout sur une page » : on y descend. Sur une partie d'une étape
     (« bien:t-surf »), on descend jusqu'à elle dans les deux modes, et elle
     s'éclaire un instant (V3.45). V3.107 : sur un champ (« bien:@quartier »),
     on descend jusqu'à lui, il s'éclaire, et le curseur s'y pose quand c'est
     un champ à taper. Un champ caché (« Balcon » sans balcon coché) : on
     s'arrête au haut de l'étape. */
  useEffect(() => {
    if (!etapeDepart || (mode !== 'tout' && !sectDepart)) return;
    const t = setTimeout(() => {
      const zone = formRef.current;
      if (!zone) return;
      const etapeEl = zone.querySelector<HTMLElement>(`[data-etape="${etapeDepart}"]`);
      const champ = sectDepart.startsWith('@') ? sectDepart.slice(1) : '';
      /* Le champ : sa boîte, ou celle de son contenu quand l'enveloppe est transparente. */
      const hote = champ ? etapeEl?.querySelector<HTMLElement>(`[data-champ="${champ}"]`) : null;
      const boite = hote && getComputedStyle(hote).display === 'contents' ? (hote.firstElementChild as HTMLElement | null) : hote;
      const x = (champ ? boite : sectDepart ? zone.querySelector<HTMLElement>(`[data-sect="${sectDepart}"]`) : null) || etapeEl;
      if (!x) return;
      /* Un champ se pose au tiers de la hauteur, avec de l'air au-dessus ; une partie, en haut. */
      const marge = champ && x !== etapeEl ? Math.min(140, zone.clientHeight * 0.25) : 12;
      if (zone.scrollHeight > zone.clientHeight + 4) zone.scrollTo({ top: x.getBoundingClientRect().top - zone.getBoundingClientRect().top + zone.scrollTop - marge });
      else x.scrollIntoView({ block: champ ? 'center' : 'start' });
      if (sectDepart && x !== etapeEl) {
        const marque = champ ? 'data-eclaire-champ' : 'data-eclaire';
        x.setAttribute(marque, 'oui'); setTimeout(() => x.removeAttribute(marque), 2200);
        /* Le curseur, seulement à la souris : au téléphone, le clavier cacherait le champ. */
        if (champ && window.matchMedia('(hover: hover)').matches) x.querySelector<HTMLElement>('input:not([type=checkbox]):not([type=radio]):not([type=file]), textarea')?.focus({ preventScroll: true });
      }
    }, sectDepart ? 380 : 50);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const aller = (i: number) => {
    const k = Math.max(0, Math.min(ETAPES.length - 1, i));
    setSens(k >= etape ? 1 : -1);
    setEtape(k);
    setVue('form');
    setMenu(false);
    if (mode === 'tout') {
      requestAnimationFrame(() => {
        const zone = formRef.current;
        const x = zone?.querySelector<HTMLElement>(`[data-etape="${ETAPES[k].id}"]`);
        if (zone && x) zone.scrollTo({ top: x.getBoundingClientRect().top - zone.getBoundingClientRect().top + zone.scrollTop - 12, behavior: 'smooth' });
      });
    } else formRef.current?.scrollTo({ top: 0 });
  };

  const texteEnreg = enreg === 'ok' ? 'Enregistré'
    : enreg === 'attente' ? 'Modifications en attente…'
      : enreg === 'encours' ? 'Enregistrement…'
        : `Non enregistré : ${enreg.erreur}`;
  const nbPhotos = lirePhotos(d.photos).length;

  const cur = Math.min(etape, ETAPES.length - 1);
  const et = etapeDe(row.etape);
  /* V3.108 : où en est chaque partie, et le tout. */
  const etats: EtatPartie[] = ETAPES.map((e, i) => ({ n: manquesParEtape[i], ok: manquesParEtape[i] === 0 && commencee(e, dv) }));
  const pct = remplissage(ETAPES, dv);
  const avant = avantMandat(row.etape);
  const aPublier = avant ? 0 : controleAnnonce(dd).filter(x => !x.ok).length;
  const totalManques = manquesParEtape.reduce((t, x) => t + x, 0);
  const sous = !avant
    ? (aPublier ? `${aPublier} point${aPublier > 1 ? 's' : ''} à compléter avant de publier l’annonce` : 'L’annonce a tout ce que la loi demande.')
    : totalManques ? `${totalManques} information${totalManques > 1 ? 's' : ''} obligatoire${totalManques > 1 ? 's' : ''} à compléter` : '';
  const allerA = (id: string) => { const k = ETAPES.findIndex(e => e.id === id); if (k >= 0) aller(k); };
  return (
    <div className={s.ed} role="dialog" aria-modal="true" aria-label={titreBien(d)}>
      <div className={`${s.edBarre} ${b.edBarre}`}>
        <button type="button" className={s.edRetour} onClick={fermer}><Ic n="retour" t={16} /><span>{nouveau ? 'Biens' : 'La fiche'}</span></button>
        <div className={s.edTitre}>
          <b>{nouveau && !d.typeBien ? 'Nouveau bien' : titreBien(d)}</b>
          <div className={s.edEtat}>
            <span className={b.edStade}><span className={b.point} style={{ background: et.c }} />{et.lib}</span>
            {row.reference && <span className={`${s.statut} ${s.t_gris}`}>{row.reference}</span>}
            <span className={typeof enreg === 'object' ? s.ko : enreg === 'ok' ? s.ok : undefined}>{texteEnreg}</span>
          </div>
        </div>
        <div className={`${s.modes} ${b.modesBarre}`} role="group" aria-label="Affichage des questions">
          <button type="button" aria-pressed={mode === 'etapes'} onClick={() => choisirMode('etapes')} title="Une partie à la fois">
            <Ic n="lignes" t={14} /><span>Partie par partie</span>
          </button>
          <button type="button" aria-pressed={mode === 'tout'} onClick={() => choisirMode('tout')} title="Toutes les questions à la suite, en blocs">
            <Ic n="doc" t={14} /><span>Tout sur une page</span>
          </button>
        </div>
        <div className={s.edBoutons}>
          <button type="button" className={`${s.btn} ${s.btnOr}`} onClick={terminer}><Ic n="check" t={15} e={2.4} />{nouveau ? 'Terminer' : 'Fermer'}</button>
        </div>
      </div>

      {/* V3.108 : le sommaire en menu, sous la barre (téléphone, tablette). */}
      <SommaireMenu etapes={ETAPES} cur={cur} etats={etats} pct={pct} ouvert={menu} onBasculer={() => setMenu(x => !x)} onAller={aller} />

      <div className={s.edOnglets} role="group" aria-label="Affichage">
        <button type="button" aria-pressed={vue === 'form'} onClick={() => setVue('form')}><Ic n="plume" t={15} />Questions</button>
        <button type="button" aria-pressed={vue === 'apercu'} onClick={() => setVue('apercu')}><Ic n="oeil" t={15} />Aperçu</button>
      </div>

      <div className={`${s.edCorps} ${b.edCorps} ${b.edA1}`} data-vue={vue} data-apercu={apercuCache ? 'cache' : undefined}>
        <aside className={b.somm} aria-label="Le sommaire">
          <Sommaire etapes={ETAPES} cur={cur} etats={etats} pct={pct} sous={sous} onAller={aller} />
        </aside>
        <div className={s.edForm} ref={formRef} onScroll={mode === 'tout' ? suivreDefilement : undefined}>
          <div className={`${s.edFormIn} ${b.edFormIn} ${s.saisieVive}`}>
            {notice && <Notice id={notice} onFermer={() => setNotice(null)} />}
            {semblables.length > 0 && <Semblables l={semblables} onOuvrir={id => { void ouvrirExistant(id); }} onIgnorer={id => setIgnores(l => [...l, id])} />}
            {mode === 'tout'
              ? ETAPES.map((e, i) => <BlocEtape key={e.id} e={e} i={i} n={ETAPES.length} d={dv} maj={maj} bienId={row.id} manques={manquesParEtape[i]} />)
              : <BlocEtape key={ETAPES[cur].id} e={ETAPES[cur]} i={cur} n={ETAPES.length} d={dv} maj={maj} bienId={row.id} manques={manquesParEtape[cur]} anime sens={sens} />}
            <div className={s.suite}>
              {mode === 'etapes' && cur > 0 ? <button type="button" className={s.btn} onClick={() => aller(cur - 1)}><Ic n="retour" t={15} />{ETAPES[cur - 1].court}</button> : <span />}
              {mode === 'etapes' && cur < ETAPES.length - 1
                ? <button type="button" className={`${s.btn} ${s.btnNavy}`} onClick={() => aller(cur + 1)}>{`Suivant : ${ETAPES[cur + 1].court}`}</button>
                : <button type="button" className={`${s.btn} ${s.btnOr}`} onClick={terminer}><Ic n="check" t={15} e={2.4} />{nouveau ? 'Terminer' : 'Fermer'}</button>}
            </div>
          </div>
        </div>
        <div className={`${s.edApercu} ${b.edApercu}`}>
          <Apercu bien={row} d={dd} ids={ETAPES.map(e => e.id)} nbPhotos={nbPhotos} onAller={allerA} onMasquer={() => montrerApercu(false)} />
        </div>
        {apercuCache && (
          <div className={`${s.edRail} ${b.edRail}`}>
            <button type="button" onClick={() => montrerApercu(true)} title="Afficher la fiche en direct">
              <Ic n="oeil" t={16} /><span>La fiche, en direct</span>
            </button>
          </div>
        )}
      </div>

      <div className={s.edPied}>
        {mode === 'etapes' && <button type="button" className={s.btn} disabled={cur === 0} onClick={() => aller(cur - 1)}><Ic n="retour" t={15} />{cur > 0 ? ETAPES[cur - 1].court : 'Précédent'}</button>}
        {mode === 'etapes' && cur < ETAPES.length - 1
          ? <button type="button" className={`${s.btn} ${s.btnNavy}`} onClick={() => aller(cur + 1)}>{`${ETAPES[cur + 1].court} →`}</button>
          : <button type="button" className={`${s.btn} ${s.btnOr}`} onClick={terminer}>{nouveau ? 'Terminer' : 'Fermer'}</button>}
      </div>
    </div>
  );
}
