'use client';
import { useState, useCallback } from 'react';

/**
 * L'espace acheteur, côté navigateur.
 * Toutes les écritures passent par /api/espace/*, qui revérifie le lien.
 */

/* ══ types ════════════════════════════════════════ */
type Bien = {
  id: string; titre: string; secteur: string; prix: number | null;
  surface: number | null; pieces: number | null; chambres: number | null;
  etage: number | null; etageTotal: number | null; expo: string | null;
  dpe: string | null; ges: string | null; annee: number | null;
  description: string | null; photos: string[];
  terrasse?: boolean; balcon?: boolean; jardin?: boolean; parking?: boolean;
  ascenseur?: boolean; cave?: boolean;
  pdfUrl: string | null; envoyeLe: string | null; vuLe: string | null;
  avis: string | null; commentaire: string | null; retourLe: string | null;
  etat: string;
};
type Criteres = {
  budgetMin: number | null; budgetMax: number | null; surfaceMin: number | null;
  piecesMin: number | null; chambresMin: number | null; secteurs: string[];
  typeBien: string | null; equip: string[]; notes: string;
};
type Props = {
  token: string;
  client: { prenom: string; nom: string; reference: string; jours: number | null };
  criteres: Criteres;
  biens: Bien[];
  passage: { quand: string | null; lues: number | null; proposees: number | null; ecartees: number | null } | null;
  semaine: { quand: string | null; lues: number }[];
};

/* ══ outils ═══════════════════════════════════════ */
const EUR = (n?: number | null) =>
  n == null ? '—' : n.toLocaleString('fr-FR').replace(/[  ]/g, ' ') + ' €';
const MOIS = ['janv.','févr.','mars','avril','mai','juin','juil.','août','sept.','oct.','nov.','déc.'];
const JOURS = ['D','L','M','M','J','V','S'];

function depuis(d?: string | null) {
  if (!d) return '';
  const x = new Date(d); if (isNaN(x.getTime())) return '';
  const h = (Date.now() - x.getTime()) / 3600000;
  if (h < 1) return "à l'instant";
  if (h < 5) return `il y a ${Math.round(h)} h`;
  if (x.toDateString() === new Date().toDateString()) return 'ce matin';
  if (h < 48) return 'hier';
  return `${x.getDate()} ${MOIS[x.getMonth()]}`;
}
function heure(d?: string | null) {
  if (!d) return '';
  const x = new Date(d); if (isNaN(x.getTime())) return '';
  const auj = x.toDateString() === new Date().toDateString();
  const h = x.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }).replace(':', ' h ');
  return auj ? `ce matin à ${h}` : `le ${x.getDate()} ${MOIS[x.getMonth()]} à ${h}`;
}

const DPEC: Record<string, string> = { A:'#319834', B:'#4ab84a', C:'#a8d84a', D:'#f7e017', E:'#f5b912', F:'#ee8235', G:'#e2231a' };
const AVIS: Record<string, { e: string; n: string; c: string }> = {
  interesse: { e: '👍', n: 'Ça me plaît', c: 'oui' },
  souhaite_visiter: { e: '👀', n: 'Je veux visiter', c: 'visite' },
  refuse: { e: '👎', n: 'Pas pour moi', c: 'non' },
};
const SECTEURS_BOULOGNE = ['Vaillant-Marcel Sembat','Parchamp–Albert Kahn','Reine–Mairie','Prince–Marmottan','Silly-Gallieni','Billancourt–Rives de Seine'];
const EQUIPS = ['Terrasse','Balcon','Jardin','Parking','Ascenseur','Cave','Gardien'];

const T: Record<string, string[]> = {
  etoile:['M12 2.8l2.5 5.4 5.9.8-4.3 4.1 1.1 5.9L12 16.2l-5.2 2.8 1.1-5.9-4.3-4.1 5.9-.8z'],
  horloge:['c:12,12,9','M12 7.4V12l3.2 2'],
  graph:['M3 20h18','M6 20V12','M11 20V6.5','M16 20v-5','M21 20v-9'],
  cible:['c:12,12,9','c:12,12,4.6','c:12,12,.9'],
  fleche:['m9.5 6 6 6-6 6'], retour:['m14 6-6 6 6 6'],
  croix:['M6.5 6.5l11 11','M17.5 6.5l-11 11'], check:['m5 13 5 5L20 6'],
  tel:['M6.2 3h3.1l1.5 3.9-2 1.3a13.4 13.4 0 0 0 6.9 6.9l1.3-2 3.9 1.5v3.1a1.9 1.9 0 0 1-2.1 1.9A17.6 17.6 0 0 1 3.1 5.1 1.9 1.9 0 0 1 5 3z'],
  lieu:['M12 21.5S19 15 19 10a7 7 0 1 0-14 0c0 5 7 11.5 7 11.5z','c:12,10,2.6'],
  crayon:['M12.5 20H21','M16.4 3.6a2.1 2.1 0 0 1 3 3L7.4 18.6 3.4 19.8l1.2-4z'],
  loupe:['c:10.8,10.8,7','m20.5 20.5-4.7-4.7'],
  euro:['M17 6.5A6.5 6.5 0 0 0 7.5 12 6.5 6.5 0 0 0 17 17.5','M4 10.5h8','M4 13.5h8'],
  maison:['M3 21h18','M5 21V9.5L12 4l7 5.5V21','M10 21v-6h4v6'],
  verrou:['M5 11.5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2V19a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2z','M8 9.5V7a4 4 0 0 1 8 0v2.5'],
  pdf:['M12 3v12','m7.5 11 4.5 4.5 4.5-4.5','M4 20h16'],
  partage:['M4 12v7a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-7','M12 3v13','m7.5 7.5 4.5-4.5 4.5 4.5'],
};
function Ico({ n, t = 22 }: { n: string; t?: number }) {
  const d = T[n]; if (!d) return null;
  return (
    <svg width={t} height={t} viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" style={{ display: 'block', flex: '0 0 auto' }}>
      {d.map((x, i) => x.startsWith('c:')
        ? (([cx, cy, r]) => <circle key={i} cx={cx} cy={cy} r={r} />)(x.slice(2).split(','))
        : <path key={i} d={x} />)}
    </svg>
  );
}

/* ══ composant ════════════════════════════════════ */
export default function EspaceClient({ token, client, criteres, biens: biensInit, passage, semaine }: Props) {
  const [vue, setVue] = useState('accueil');
  const [biens, setBiens] = useState(biensInit);
  const [crit, setCrit] = useState(criteres);
  const [feuille, setFeuille] = useState<React.ReactNode>(null);
  const [ouvert, setOuvert] = useState(false);

  const envoyer = useCallback(async (route: string, corps: Record<string, unknown>) => {
    try {
      const r = await fetch('/api/espace/' + route, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, ...corps }),
      });
      return await r.json();
    } catch { return { ok: false }; }
  }, [token]);

  const montrer = (n: React.ReactNode) => { setFeuille(n); setOuvert(true); };
  const fermer = () => { setOuvert(false); setTimeout(() => setFeuille(null), 320); };
  const aller = (v: string) => { setVue(v); window.scrollTo({ top: 0, behavior: 'smooth' }); };

  const parEtat = (e: string) => biens.filter(b => b.etat === e);
  const neufs = parEtat('neuf'), vus = parEtat('vu'), donnes = parEtat('avis');

  /* ── ouverture d'une fiche ── */
  function ouvrirBien(b: Bien) {
    if (b.etat === 'neuf') {
      setBiens(l => l.map(x => x.id === b.id ? { ...x, etat: 'vu', vuLe: new Date().toISOString() } : x));
      envoyer('vue', { bien_id: b.id });
    }
    montrer(<FicheBien b={b} onFermer={fermer} onAvis={enregistrerAvis} onPartage={ouvrirPartage} />);
  }

  async function enregistrerAvis(b: Bien, avis: string, commentaire: string) {
    setBiens(l => l.map(x => x.id === b.id
      ? { ...x, avis, commentaire, etat: 'avis', retourLe: new Date().toISOString() } : x));
    await envoyer('retour', { bien_id: b.id, avis, commentaire });
    montrer(<GrandOk
      titre="C'est noté, merci"
      texte={avis === 'refuse'
        ? "Votre retour part directement dans votre dossier. La chasse de demain matin en tiendra compte pour ne plus vous proposer ce type de bien."
        : avis === 'souhaite_visiter'
          ? "Alexandre est prévenu. Il vous rappelle pour caler la visite."
          : "Alexandre est prévenu. Il va vous en chercher d'autres dans le même esprit."}
      rappel="Chacun de vos retours est relu avant la chasse du lendemain."
      onFermer={fermer} />);
  }

  function ouvrirPartage(b: Bien) {
    montrer(<Partage b={b} client={client} onFermer={fermer} onEnvoi={async (mail: string) => {
      const r = await envoyer('partage', { bien_id: b.id, destinataire: mail });
      montrer(<GrandOk titre="La fiche est partie"
        texte={r?.ok ? `${mail} vient de recevoir la fiche du bien.` : `L'envoi n'a pas pu aboutir. Réessayez dans un instant, ou copiez le lien.`}
        onFermer={fermer} />);
    }} />);
  }

  function ouvrirCriteres() {
    montrer(<ModifCriteres crit={crit} onFermer={fermer} onEnregistrer={async (nv: Criteres, changements: string[]) => {
      setCrit(nv);
      await envoyer('criteres', { criteres: nv });
      montrer(<GrandOk titre="Vos critères sont à jour"
        texte="Merci d'avoir pris le temps de les préciser. Votre recherche est modifiée dès à présent, et la chasse de demain matin partira sur ces nouvelles bases."
        rappel={changements.length ? '<b>Ce qui a changé :</b><br>' + changements.join(' · ') : 'Alexandre est prévenu du changement.'}
        onFermer={fermer} />);
    }} />);
  }

  function ouvrirMessage() {
    montrer(<Message onFermer={fermer} onEnvoi={async (texte: string) => {
      await envoyer('message', { texte });
      montrer(<GrandOk titre="Votre message est bien parti"
        texte="Alexandre vient d'être prévenu. Il relit vos précisions et vous recontacte rapidement pour en parler avec vous."
        rappel="En attendant, la chasse continue tous les matins sur vos critères actuels."
        onFermer={fermer} />);
    }} />);
  }

  const maxLues = Math.max(1, ...semaine.map(s => s.lues));

  return (
    <>
      <style>{CSS}</style>

      <div className="chapeau">
        <div className="marque">
          <span className="motmarque">EMILIO IMMOBILIER</span>
          <span className="confid">Espace privé</span>
        </div>
        <div className="ident">
          <div className="mono">{(client.prenom[0] || '') + (client.nom[0] || '')}</div>
          <div>
            <h1>{client.prenom} {client.nom}</h1>
            <div className="ref">
              Dossier {client.reference}{client.jours ? ` · suivi depuis ${client.jours} jours` : ''}
            </div>
          </div>
        </div>
        {passage?.quand && (
          <div className="veilleligne"><span className="pouls" /> Dernière chasse {heure(passage.quand)}</div>
        )}
      </div>

      <div className="page">
        <div className="vue" key={vue}>
          {vue === 'accueil' && (
            <Accueil client={client} crit={crit} neufs={neufs} vus={vus} donnes={donnes}
              passage={passage} semaine={semaine} maxLues={maxLues} aller={aller} />
          )}
          {vue === 'neufs' && (
            <Vue icone="etoile" titre="Nouveaux biens pour vous" aller={aller}
              sous={neufs.length
                ? `${neufs.length} bien${neufs.length > 1 ? 's' : ''} retenu${neufs.length > 1 ? 's' : ''} pour vous depuis votre dernière visite, du plus récent au plus ancien. Ouvrez-les, puis dites-moi ce que vous en pensez.`
                : 'Rien de nouveau depuis votre dernière visite.'}>
              <Liste biens={neufs} onOuvrir={ouvrirBien}
                vide="Rien de nouveau.<br>La prochaine chasse tourne demain matin." />
              {!!passage?.lues && (
                <div className="relance" style={{ marginTop: 16 }}><Ico n="loupe" t={18} />
                  <span>Ces biens sont ceux qui ont passé tous vos critères ce matin, sur {passage.lues} annonces lues.</span>
                </div>
              )}
            </Vue>
          )}
          {vue === 'consultes' && (
            <Vue icone="horloge" titre="Mes derniers biens consultés" aller={aller}
              sous="Tout ce que vous avez déjà ouvert, du plus récent au plus ancien, avec vos retours.">
              {vus.length > 0 && (
                <div>
                  <div className="bloc-titre"><h3>En attente de votre avis</h3><span className="n or">{vus.length}</span></div>
                  <div className="relance"><Ico n="horloge" t={18} />
                    <span>Vous les avez regardés sans me dire ce que vous en pensiez. Un mot suffit&nbsp;— c&apos;est ce qui affine la chasse du lendemain.</span>
                  </div>
                  <Liste biens={vus} onOuvrir={ouvrirBien} vide="" />
                </div>
              )}
              <div>
                <div className="bloc-titre"><h3>Vos avis</h3><span className="n">{donnes.length}</span></div>
                <Liste biens={donnes} onOuvrir={ouvrirBien} vide="Vos avis apparaîtront ici dès que vous en aurez donné un." />
              </div>
            </Vue>
          )}
          {vue === 'marche' && (
            <Marche passage={passage} semaine={semaine} maxLues={maxLues} aller={aller} />
          )}
          {vue === 'recherche' && (
            <Recherche crit={crit} aller={aller} onCriteres={ouvrirCriteres} onMessage={ouvrirMessage} />
          )}
        </div>

        <div className="pied">
          <b>Emilio Immobilier</b> · RT Conseils · CPI 9201 2020 000 045 344<br />
          Chasse immobilière sur mesure · Paris &amp; Hauts-de-Seine
        </div>
      </div>

      <div className={'voile' + (ouvert ? ' on' : '')} onClick={fermer} />
      <div className={'feuille' + (ouvert ? ' on' : '')} role="dialog" aria-modal="true">
        <div className="poignee" />{feuille}
      </div>
    </>
  );
}

/* ══ accueil ══════════════════════════════════════ */
function Accueil({ client, crit, neufs, vus, donnes, passage, semaine, maxLues, aller }: any) {
  const dernier = donnes[0] || vus[0];
  return (
    <>
      <div className="hero">
        <div className="sur">Votre espace personnel</div>
        <h2>Bienvenue, {client.prenom}</h2>
        <p>Votre recherche est suivie <b>tous les matins</b>. Ici, rien à retenir et rien à installer&nbsp;:
          vous ouvrez le lien, vous voyez où en est votre projet.</p>
        <div className="puces">
          <span><span className="k"><Ico n="check" t={15} /></span>Les biens retenus pour vous, dès qu&apos;ils sortent</span>
          <span><span className="k"><Ico n="check" t={15} /></span>Ce que la chasse a lu ce matin, et ce qu&apos;elle a écarté</span>
          <span><span className="k"><Ico n="check" t={15} /></span>Vos critères, que vous pouvez faire évoluer vous-même</span>
        </div>
        <div className="prochaine"><span className="pouls" style={{ background: 'currentColor' }} /> Prochaine chasse demain matin</div>
      </div>

      <div className="bandeau-chiffres">
        <div className="bc"><div className="n or tab">{neufs.length}</div><div className="l">à découvrir</div></div>
        <div className="bc"><div className="n tab">{passage?.lues ?? '—'}</div><div className="l">lues ce matin</div></div>
        <div className="bc"><div className="n tab">{client.jours ?? '—'}</div><div className="l">jours de suivi</div></div>
      </div>

      <div className="sep"><span>Votre espace</span><i /></div>

      <div className="grille">
        <button className={'case large' + (neufs.length ? ' phare' : '')} onClick={() => aller('neufs')}>
          <div className="tete-case">
            <span className="ico"><Ico n="etoile" /></span>
            {!!neufs.length && <span className="badge">{neufs.length}</span>}
          </div>
          <div><h3>Nouveaux biens pour vous</h3>
            <p>{neufs.length ? `${neufs.length} bien${neufs.length > 1 ? 's' : ''} retenu${neufs.length > 1 ? 's' : ''} depuis votre dernière visite` : 'Sélection à jour'}</p></div>
          {neufs.length > 0 && (
            <div className="apercu">
              {neufs.slice(0, 2).map((b: Bien) => (
                <span className="apl" key={b.id}>
                  <span className="pt">{b.photos[0] ? <img src={b.photos[0]} alt="" /> : '▣'}</span>
                  <b>{b.surface ? b.surface + ' m²' : b.titre.slice(0, 22)}</b> · {EUR(b.prix)}
                </span>
              ))}
            </div>
          )}
          <div className="pied-case">
            <span style={{ fontSize: 13, fontWeight: 700 }}>{neufs.length ? 'Les découvrir' : 'Revoir la sélection'}</span>
            <span className="chev"><Ico n="fleche" t={18} /></span></div>
        </button>

        <button className="case" onClick={() => aller('consultes')}>
          <div className="tete-case"><span className="ico"><Ico n="horloge" t={21} /></span>
            {!!(vus.length || donnes.length) && <span className={'badge' + (vus.length ? '' : ' gris')}>{vus.length || donnes.length}</span>}</div>
          <div><h3>Mes derniers biens consultés</h3>
            <p>{vus.length ? `${vus.length} attend${vus.length > 1 ? 'ent' : ''} votre avis` : 'Vos avis et vos retours'}</p></div>
          {dernier && (
            <div className="apercu"><span className="apl"><span className="pt">▣</span>
              <b>{dernier.avis && AVIS[dernier.avis] ? AVIS[dernier.avis].n : 'En attente'}</b></span></div>
          )}
          <div className="pied-case"><span /><span className="chev"><Ico n="fleche" t={18} /></span></div>
        </button>

        <button className="case" onClick={() => aller('marche')}>
          <div className="tete-case"><span className="ico"><Ico n="graph" t={21} /></span></div>
          <div><h3>Le marché sur vos critères</h3>
            <p>{semaine.reduce((s: number, x: any) => s + x.lues, 0)} annonces lues cette semaine</p></div>
          <div className="mini">{semaine.map((d: any, i: number) => (
            <i key={i} className={i === semaine.length - 1 ? 'fort' : ''}
              style={{ height: Math.max(8, d.lues / maxLues * 100) + '%', animationDelay: i * .05 + 's' }} />
          ))}</div>
          <div className="pied-case"><span /><span className="chev"><Ico n="fleche" t={18} /></span></div>
        </button>

        <button className="case large" onClick={() => aller('recherche')}>
          <div className="tete-case"><span className="ico"><Ico n="cible" /></span></div>
          <div><h3>Rappel de ma recherche</h3>
            <p>{crit.budgetMax ? `Jusqu'à ${EUR(crit.budgetMax)}` : 'Budget à préciser'}
              {crit.surfaceMin ? ` · ${crit.surfaceMin} m² minimum` : ''}
              {crit.piecesMin ? ` · ${crit.piecesMin} pièces` : ''}</p></div>
          <div className="pied-case">
            <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--plume)' }}>Vos critères ont changé&nbsp;? Modifiez-les ici</span>
            <span className="chev"><Ico n="fleche" t={18} /></span></div>
        </button>
      </div>

      <div className="sep"><span>Votre chasseur</span><i /></div>
      <div className="chasseur">
        <div className="av">AR</div>
        <div><h4>Alexandre Rogelet</h4><p>Il cherche pour vous tous les matins</p></div>
        <a className="tel" href="tel:0658957632"><Ico n="tel" t={15} /> Appeler</a>
      </div>

      <div className="engage" style={{ marginTop: 12 }}>
        <div className="t">Mon engagement</div>
        <div><span className="k"><Ico n="check" t={15} /></span><span>Une chasse tous les matins&nbsp;: les principaux portails immobiliers, notre carnet d&apos;adresses de confrères et de partenaires, et notre base off-market.</span></div>
        <div><span className="k"><Ico n="check" t={15} /></span><span>Tout bien qui passe vos critères arrive ici dans la journée, avant qu&apos;il ne circule.</span></div>
        <div><span className="k"><Ico n="check" t={15} /></span><span>Chacun de vos retours est relu avant la chasse du lendemain.</span></div>
      </div>

      <div className="avis-lien" style={{ marginTop: 12 }}><Ico n="lieu" t={16} />
        <span><b style={{ color: 'var(--encre)' }}>Ce lien est le vôtre.</b> Il vous ouvre votre espace sans mot de passe
          — gardez-le pour vous, ou transmettez-le à votre conjoint ou à un proche qui suit le projet avec vous&nbsp;:
          il verra exactement la même chose.</span></div>
    </>
  );
}

/* ══ briques de vue ═══════════════════════════════ */
function Vue({ icone, titre, sous, aller, children }: any) {
  return (
    <>
      <button className="retour" onClick={() => aller('accueil')}><Ico n="retour" t={17} /> Retour à l&apos;accueil</button>
      <div>
        <div className="tete-vue"><span className="ico"><Ico n={icone} /></span><h2>{titre}</h2></div>
        {sous && <p className="sous-vue">{sous}</p>}
      </div>
      {children}
    </>
  );
}

function Liste({ biens, onOuvrir, vide }: { biens: Bien[]; onOuvrir: (b: Bien) => void; vide: string }) {
  if (!biens.length) return vide ? <div className="vide-sec" dangerouslySetInnerHTML={{ __html: vide }} /> : null;
  return (
    <div className="liste">
      {biens.map(b => {
        const a = b.avis ? AVIS[b.avis] : null;
        return (
          <button key={b.id} className={'bien' + (b.etat === 'neuf' ? ' neuf' : '')} onClick={() => onOuvrir(b)}>
            <span className="vignette">{b.photos[0]
              ? <img src={b.photos[0]} alt="" />
              : <span style={{ fontSize: 18 }}>▣</span>}</span>
            <span>
              <span className="haut-bien">
                {b.etat === 'neuf'
                  ? <span className="etiq neuf">Nouveau</span>
                  : b.etat === 'avis' && a
                    ? <span className={'etiq ' + a.c}>{a.e} {a.n}</span>
                    : <span className="etiq vu">Vu</span>}
                <span className="dat">{depuis(b.envoyeLe)}</span>
              </span>
              <h4>{b.titre}</h4>
              <span className="meta">{[
                b.surface && b.surface + ' m²', b.pieces && b.pieces + ' pièces',
                b.chambres && b.chambres + ' chambres', b.secteur,
              ].filter(Boolean).join(' · ')}</span>
              <div className="prix tab">{EUR(b.prix)}</div>
              {b.etat === 'avis' && b.commentaire && (
                <div className="meta" style={{ marginTop: 6, fontStyle: 'italic' }}>« {b.commentaire} »</div>
              )}
            </span>
            <span className="fleche"><Ico n="fleche" t={19} /></span>
          </button>
        );
      })}
    </div>
  );
}

function Marche({ passage, semaine, maxLues, aller }: any) {
  const total = semaine.reduce((s: number, x: any) => s + x.lues, 0);
  return (
    <Vue icone="graph" titre="Le marché sur vos critères" aller={aller}
      sous="Ce que la chasse a parcouru pour vous. Elle tourne tous les matins, sur les principaux portails immobiliers, notre carnet d'adresses de confrères et de partenaires, et notre base off-market.">
      <div className="tuiles">
        <div className="tuile"><div className="n tab">{passage?.lues ?? '—'}</div><div className="l">annonces lues ce matin</div></div>
        <div className="tuile"><div className="n tab or">{passage?.proposees ?? '—'}</div><div className="l">retenues pour vous</div></div>
        <div className="tuile"><div className="n tab pale">{passage?.ecartees ?? '—'}</div><div className="l">écartées</div></div>
        <div className="tuile"><div className="n tab">{total}</div><div className="l">lues cette semaine</div></div>
      </div>
      <p className="note">Chaque matin, la chasse relit l&apos;intégralité du marché sur votre secteur.
        Ce qui ne passe pas vos critères est écarté avant même de vous être montré&nbsp;— vous ne voyez
        que ce qui mérite votre temps.</p>
      {semaine.length > 1 && (
        <div className="graphe">
          <div className="bloc-titre" style={{ margin: 0 }}><h3>Annonces lues, jour par jour</h3></div>
          <div className="barres">
            {semaine.map((d: any, i: number) => {
              const j = d.quand ? JOURS[new Date(d.quand).getDay()] : '·';
              return (
                <span className={'barre' + (i === semaine.length - 1 ? ' auj' : '')} key={i}>
                  <b>{d.lues || '—'}</b>
                  <i style={{ height: Math.max(4, d.lues / maxLues * 100) + '%', animationDelay: i * .06 + 's' }} />
                  <span>{j}</span>
                </span>
              );
            })}
          </div>
        </div>
      )}
    </Vue>
  );
}

function Recherche({ crit, aller, onCriteres, onMessage }: any) {
  const lo = 400000, hi = 3000000;
  const bmin = crit.budgetMin || Math.max(lo, (crit.budgetMax || 1000000) * 0.75);
  const bmax = crit.budgetMax || bmin * 1.3;
  return (
    <Vue icone="cible" titre="Rappel de ma recherche" aller={aller}
      sous="Ce qu'Alexandre a noté de votre projet. Tout ce qui est chiffré, vous pouvez le faire évoluer vous-même.">
      <div className="bloc">
        <div className="t"><Ico n="euro" t={15} /> Budget</div>
        <div className="gros tab">{EUR(bmin)} <small>à</small> {EUR(bmax)}</div>
        <div className="jauge"><i style={{ marginLeft: (bmin - lo) / (hi - lo) * 100 + '%', width: (bmax - bmin) / (hi - lo) * 100 + '%' }} /></div>
      </div>
      <div className="bloc">
        <div className="t"><Ico n="maison" t={15} /> Le bien</div>
        <div className="trio">
          <div className="mini-t"><div className="v tab">{crit.surfaceMin ? crit.surfaceMin + ' m²' : '—'}</div><div className="l">surface min.</div></div>
          <div className="mini-t"><div className="v tab">{crit.piecesMin ?? '—'}</div><div className="l">pièces min.</div></div>
          <div className="mini-t"><div className="v tab">{crit.chambresMin ?? '—'}</div><div className="l">chambres min.</div></div>
        </div>
        {!!crit.equip.length && (
          <div style={{ marginTop: 14 }}>
            <div className="t" style={{ marginBottom: 9 }}>Souhaités</div>
            <div className="pastilles">{crit.equip.map((e: string) => <span className="past or" key={e}>{e}</span>)}</div>
          </div>
        )}
      </div>
      {!!crit.secteurs.length && (
        <div className="bloc">
          <div className="t"><Ico n="lieu" t={15} /> Secteurs</div>
          <div className="pastilles">{crit.secteurs.map((s: string) => <span className="past" key={s}>{s}</span>)}</div>
        </div>
      )}
      <div className="precisions">
        <span className="k"><Ico n="crayon" t={13} /> Précisions sur votre recherche — notées par votre chasseur</span>
        <div className="corps">{crit.notes || 'Aucune précision notée pour l’instant.'}</div>
        <div className="verrou"><Ico n="verrou" t={13} /> Ce texte est la note d&apos;Alexandre. Vous ne pouvez pas le modifier vous-même.</div>
        <button className="cta-prec" onClick={onMessage}>
          <span><b>Une précision à ajouter ou à retirer&nbsp;?</b>
            <span className="s">Dites-le-lui, il met à jour et vous recontacte.</span></span>
          <span className="chev"><Ico n="fleche" t={18} /></span>
        </button>
      </div>
      <div className="duo"><button className="btn or" onClick={onCriteres}><Ico n="crayon" t={16} /> Mes critères ont évolué</button></div>
    </Vue>
  );
}

/* ══ feuilles ═════════════════════════════════════ */
function FicheBien({ b, onFermer, onAvis, onPartage }: any) {
  const [avis, setAvis] = useState<string | null>(b.avis);
  const [com, setCom] = useState(b.commentaire || '');
  const [i, setI] = useState(0);
  const photos: string[] = b.photos || [];
  const dpe = (l: string | null, t: string) => l && DPEC[l.toUpperCase()?.[0]] ? (
    <span className="dpe"><span className="l" style={{ background: DPEC[l.toUpperCase()[0]] }}>{l.toUpperCase()[0]}</span>
      <span className="t">{t}</span></span>
  ) : null;

  return (
    <>
      <div className="photo-h">
        {photos[i] ? <img src={photos[i]} alt="" /> : <span style={{ fontSize: 30 }}>▣</span>}
        {photos.length > 1 && (
          <div className="points">{photos.slice(0, 10).map((_, n) => (
            <button key={n} onClick={() => setI(n)} className={n === i ? 'on' : ''} aria-label={`Photo ${n + 1}`} />
          ))}</div>
        )}
      </div>
      <div className="bandeau-prix">
        <span className="p tab">{EUR(b.prix)}</span>
        {b.prix && b.surface ? <span className="m2 tab">{Math.round(b.prix / b.surface).toLocaleString('fr-FR').replace(/[  ]/g, ' ')} €/m²</span> : null}
      </div>
      <div className="tete-f" style={{ paddingTop: 10 }}>
        <div><h3>{b.titre}</h3>
          {b.secteur && <div className="meta" style={{ color: 'var(--plume)', fontSize: 13, marginTop: 5, display: 'flex', gap: 6, alignItems: 'center' }}>
            <Ico n="lieu" t={13} /> {b.secteur}</div>}</div>
        <button className="fermer" onClick={onFermer} aria-label="Fermer"><Ico n="croix" t={14} /></button>
      </div>
      <div className="corps-f">
        <div className="specs">
          {b.surface ? <div className="spec"><div className="v tab">{b.surface} m²</div><div className="l">Surface</div></div> : null}
          {b.pieces ? <div className="spec"><div className="v tab">{b.pieces}</div><div className="l">Pièces</div></div> : null}
          {b.chambres ? <div className="spec"><div className="v tab">{b.chambres}</div><div className="l">Chambres</div></div> : null}
          {b.etage != null ? <div className="spec"><div className="v tab">{b.etage === 0 ? 'RDC' : b.etage + 'e'}{b.etageTotal ? '/' + b.etageTotal : ''}</div><div className="l">Étage</div></div> : null}
          {b.expo ? <div className="spec"><div className="v">{b.expo}</div><div className="l">Exposition</div></div> : null}
        </div>
        <div>{dpe(b.dpe, 'DPE')}{dpe(b.ges, 'GES')}
          {b.annee ? <span className="dpe"><span className="t">Immeuble {b.annee}</span></span> : null}</div>
        {b.description && b.description.split('\n\n').map((p: string, n: number) => <p className="txt" key={n}>{p}</p>)}

        <label className="lab">Qu&apos;en pensez-vous&nbsp;?</label>
        <div className="avis3">
          {Object.entries(AVIS).map(([k, a]) => (
            <button key={k} className="avis" data-a={a.c} aria-pressed={avis === k} onClick={() => setAvis(k)}>
              <span className="e">{a.e}</span><span className="n">{a.n}</span>
            </button>
          ))}
        </div>
        {avis && (
          <div style={{ marginTop: 12 }}>
            <textarea rows={2} value={com} onChange={e => setCom(e.target.value)}
              placeholder="Un mot, si vous voulez : ce qui vous plaît, ce qui bloque…" />
            <button className="btn or" style={{ marginTop: 10 }} onClick={() => onAvis(b, avis, com.trim())}>
              Envoyer mon avis</button>
          </div>
        )}
        <div className="duo">
          <button className="btn fant" onClick={() => onPartage(b)}><Ico n="partage" t={16} /> Partager</button>
          {b.pdfUrl
            ? <a className="btn fant" href={b.pdfUrl} target="_blank" rel="noopener noreferrer"><Ico n="pdf" t={16} /> La fiche PDF</a>
            : null}
        </div>
      </div>
    </>
  );
}

function Partage({ b, client, onFermer, onEnvoi }: any) {
  const [mail, setMail] = useState('');
  const [erreur, setErreur] = useState(false);
  const lien = typeof window !== 'undefined' ? `${window.location.origin}/bien/${b.id}` : '';
  return (
    <>
      <div className="tete-f">
        <div><div className="sur">Partager ce bien</div><h3>{b.titre}</h3></div>
        <button className="fermer" onClick={onFermer} aria-label="Fermer"><Ico n="croix" t={14} /></button>
      </div>
      <div className="corps-f">
        <label className="lab" htmlFor="mail">À qui l&apos;envoyer&nbsp;?</label>
        <input id="mail" type="email" autoComplete="email" placeholder="son adresse e-mail"
          value={mail} style={erreur ? { borderColor: 'var(--brique)' } : undefined}
          onChange={e => { setMail(e.target.value); setErreur(false); }} />
        <label className="lab">Objet</label>
        <div className="fige">{client.prenom} vous partage un bien</div>
        <label className="lab">Message</label>
        <div className="fige">Bonjour,<br /><br />Voici un bien que je suis en train de regarder avec mon chasseur
          immobilier. Dites-moi ce que vous en pensez.<br /><br />{b.titre}<br />
          {[b.surface && b.surface + ' m²', EUR(b.prix)].filter(Boolean).join(' · ')}<br />
          <span style={{ color: 'var(--or-fonce)' }}>{lien}</span><br /><br />{client.prenom}</div>
        <p className="txt" style={{ fontSize: 12.5, color: 'var(--plume-clair)' }}>Le message part au nom d&apos;Emilio Immobilier.</p>
        <button className="btn or" onClick={() => {
          if (!/.+@.+\..+/.test(mail.trim())) { setErreur(true); return; }
          onEnvoi(mail.trim());
        }}>Envoyer</button>
        <div style={{ textAlign: 'center' }}>
          <button className="btn lien" onClick={() => { navigator.clipboard?.writeText(lien); onFermer(); }}>
            ou copier le lien</button>
        </div>
      </div>
    </>
  );
}

function ModifCriteres({ crit, onFermer, onEnregistrer }: any) {
  const [t, setT] = useState({
    budgetMin: crit.budgetMin || Math.round((crit.budgetMax || 1000000) * 0.75 / 25000) * 25000,
    budgetMax: crit.budgetMax || 1500000,
    surfaceMin: crit.surfaceMin || 60,
    piecesMin: crit.piecesMin || 3,
    chambresMin: crit.chambresMin || 2,
    secteurs: [...crit.secteurs], equip: [...crit.equip],
  });
  const lo = 400000, hi = 3000000;
  const pas = (cle: string, d: number) => {
    setT(v => {
      const n = { ...v } as any;
      const p = cle === 'surfaceMin' ? 5 : 25000;
      n[cle] = Math.max(cle === 'surfaceMin' ? 20 : 300000, n[cle] + d * p);
      if (n.budgetMin > n.budgetMax - 100000) {
        if (cle === 'budgetMin') n.budgetMax = n.budgetMin + 100000; else n.budgetMin = n.budgetMax - 100000;
      }
      return n;
    });
  };
  const bascule = (cle: 'secteurs' | 'equip', v: string) =>
    setT(x => ({ ...x, [cle]: x[cle].includes(v) ? x[cle].filter(y => y !== v) : [...x[cle], v] }));

  const secteurs = Array.from(new Set([...crit.secteurs, ...SECTEURS_BOULOGNE]));

  return (
    <>
      <div className="tete-f">
        <div><div className="sur">Votre recherche</div><h3>Ce qui a changé</h3></div>
        <button className="fermer" onClick={onFermer} aria-label="Fermer"><Ico n="croix" t={14} /></button>
      </div>
      <div className="corps-f">
        <label className="lab">Budget</label>
        <div className="pas"><button className="rond" onClick={() => pas('budgetMin', -1)}>−</button>
          <span className="val tab">{EUR(t.budgetMin)}</span>
          <button className="rond" onClick={() => pas('budgetMin', 1)}>+</button></div>
        <div style={{ height: 8 }} />
        <div className="pas"><button className="rond" onClick={() => pas('budgetMax', -1)}>−</button>
          <span className="val tab">{EUR(t.budgetMax)}</span>
          <button className="rond" onClick={() => pas('budgetMax', 1)}>+</button></div>
        <div className="jauge"><i style={{ marginLeft: (t.budgetMin - lo) / (hi - lo) * 100 + '%', width: (t.budgetMax - t.budgetMin) / (hi - lo) * 100 + '%' }} /></div>

        <label className="lab">Surface minimum</label>
        <div className="pas"><button className="rond" onClick={() => pas('surfaceMin', -1)}>−</button>
          <span className="val tab">{t.surfaceMin} m²</span>
          <button className="rond" onClick={() => pas('surfaceMin', 1)}>+</button></div>

        <label className="lab">Pièces minimum</label>
        <div className="choix">{[2, 3, 4, 5, 6].map(n => (
          <button key={n} className="ch" aria-pressed={t.piecesMin === n} onClick={() => setT(v => ({ ...v, piecesMin: n }))}>{n}{n === 6 ? '+' : ''}</button>))}</div>

        <label className="lab">Chambres minimum</label>
        <div className="choix">{[1, 2, 3, 4, 5].map(n => (
          <button key={n} className="ch" aria-pressed={t.chambresMin === n} onClick={() => setT(v => ({ ...v, chambresMin: n }))}>{n}{n === 5 ? '+' : ''}</button>))}</div>

        <label className="lab">Secteurs</label>
        <div className="choix">{secteurs.map(s => (
          <button key={s} className="ch" aria-pressed={t.secteurs.includes(s)} onClick={() => bascule('secteurs', s)}>{s}</button>))}</div>

        <label className="lab">Souhaités</label>
        <div className="choix">{EQUIPS.map(e => (
          <button key={e} className="ch or" aria-pressed={t.equip.includes(e)} onClick={() => bascule('equip', e)}>{e}</button>))}</div>

        <button className="btn or" style={{ marginTop: 22 }} onClick={() => {
          const c: string[] = [];
          if (t.budgetMin !== crit.budgetMin || t.budgetMax !== crit.budgetMax) c.push('budget ' + EUR(t.budgetMin) + ' – ' + EUR(t.budgetMax));
          if (t.surfaceMin !== crit.surfaceMin) c.push(t.surfaceMin + ' m² minimum');
          if (t.piecesMin !== crit.piecesMin) c.push(t.piecesMin + ' pièces minimum');
          if (t.chambresMin !== crit.chambresMin) c.push(t.chambresMin + ' chambres minimum');
          if (t.secteurs.join() !== crit.secteurs.join()) c.push(t.secteurs.length + ' secteurs');
          if (t.equip.join() !== crit.equip.join()) c.push('équipements souhaités');
          onEnregistrer({ ...crit, ...t }, c);
        }}>Enregistrer</button>
      </div>
    </>
  );
}

function Message({ onFermer, onEnvoi }: any) {
  const [txt, setTxt] = useState('');
  return (
    <>
      <div className="tete-f">
        <div><div className="sur">Message</div><h3>Dites-moi tout</h3></div>
        <button className="fermer" onClick={onFermer} aria-label="Fermer"><Ico n="croix" t={14} /></button>
      </div>
      <div className="corps-f">
        <p className="txt" style={{ marginTop: 0, color: 'var(--plume)' }}>Alexandre le reçoit tout de suite et vous rappelle.</p>
        <textarea rows={5} value={txt} onChange={e => setTxt(e.target.value)} autoFocus
          placeholder="Ex : finalement on pourrait regarder un peu plus loin, et on peut monter si le bien est refait." />
        <button className="btn encre" style={{ marginTop: 12 }}
          onClick={() => txt.trim() && onEnvoi(txt.trim())}>Envoyer</button>
      </div>
    </>
  );
}

function GrandOk({ titre, texte, rappel, onFermer }: any) {
  return (
    <div className="grandok">
      <div className="rond-ok"><Ico n="check" t={36} /></div>
      <h3>{titre}</h3>
      <p>{texte}</p>
      {rappel && <div className="rappel" dangerouslySetInnerHTML={{ __html: rappel }} />}
      <button className="btn or" style={{ marginTop: 22 }} onClick={onFermer}>Parfait</button>
    </div>
  );
}

/* ══ styles ═══════════════════════════════════════ */
const CSS = `
:root{
  --encre:#1a2332; --encre2:#2a3a52; --or:#c9a84c; --or-fonce:#a9822f;
  --fond:#f4f6fa; --carte:#fff; --trait:#e3e8f0; --trait-fort:#cfd7e3;
  --plume:#64748b; --plume-clair:#98a4b6;
  --vert:#15803d; --vert-fond:#f0fdf4; --vert-trait:#bbf7d0;
  --prune:#7c3aed; --prune-fond:#f5f3ff; --prune-trait:#ddd6fe;
  --brique:#dc2626; --brique-fond:#fef2f2; --brique-trait:#fecaca;
  --or-fond:#fdfaf1; --or-trait:#ecdcb4;
  --bleu:#2563eb; --bleu-fond:#eff6ff; --bleu-trait:#bfdbfe;
  --ambre:#e0822e; --ambre-clair:#f0a355; --ambre-fond:#fff6ec; --ambre-trait:#f7d5b0;
  --ombre:0 1px 2px rgba(16,24,40,.04), 0 10px 26px -20px rgba(16,24,40,.3);
  --ombre-f:0 2px 4px rgba(16,24,40,.05), 0 20px 44px -24px rgba(16,24,40,.5);
}
*{box-sizing:border-box}
body{margin:0; background:var(--fond); color:var(--encre);
  font-family:'DM Sans','Plus Jakarta Sans',system-ui,-apple-system,sans-serif; font-size:15px; line-height:1.55;
  -webkit-font-smoothing:antialiased}
h1,h2,h3,h4{font-family:'Plus Jakarta Sans',system-ui,sans-serif; letter-spacing:-.4px}
.tab{font-variant-numeric:tabular-nums}
button{font-family:inherit; cursor:pointer; color:inherit; border:none; background:none}
:focus-visible{outline:2px solid var(--or); outline-offset:2px; border-radius:8px}

.chapeau{background:linear-gradient(152deg,#3a5178 0%,#27395a 52%,#2e4166 100%);
  color:#fff; padding:22px 20px 26px; position:relative; overflow:hidden}
.chapeau::after{content:""; position:absolute; top:-130px; right:-80px; width:320px; height:320px;
  border-radius:50%; background:radial-gradient(circle,rgba(201,168,76,.24),transparent 64%)}
.marque{position:relative; display:flex; align-items:center; justify-content:space-between; gap:12px}
.motmarque{font-family:'Plus Jakarta Sans',sans-serif; font-size:11px; font-weight:800; letter-spacing:2.2px; color:var(--or)}
.confid{font-size:9.5px; letter-spacing:1.3px; color:rgba(255,255,255,.42); text-transform:uppercase; font-weight:700}
.ident{position:relative; margin-top:20px; display:flex; align-items:center; gap:14px}
.mono{width:48px; height:48px; border-radius:50%; background:rgba(255,255,255,.08);
  border:1px solid rgba(201,168,76,.45); display:flex; align-items:center; justify-content:center;
  font-family:'Plus Jakarta Sans',sans-serif; font-weight:800; font-size:18px; color:var(--or); flex:0 0 auto}
.ident h1{margin:0; font-size:23px; font-weight:800; color:#fff; line-height:1.15}
.ident .ref{font-size:12px; color:rgba(255,255,255,.45); margin-top:2px}
.veilleligne{position:relative; margin-top:16px; display:inline-flex; align-items:center; gap:9px;
  background:rgba(255,255,255,.08); border:1px solid rgba(255,255,255,.15);
  border-radius:99px; padding:7px 15px 7px 12px; font-size:12.5px; color:rgba(255,255,255,.85)}
.pouls{width:7px; height:7px; border-radius:50%; background:#5fd39b; flex:0 0 auto;
  box-shadow:0 0 0 0 rgba(95,211,155,.6); animation:pouls 2.6s ease-out infinite}
@keyframes pouls{0%{box-shadow:0 0 0 0 rgba(95,211,155,.5)}70%{box-shadow:0 0 0 9px rgba(95,211,155,0)}100%{box-shadow:0 0 0 0 rgba(95,211,155,0)}}

.page{max-width:680px; margin:0 auto; padding:0 20px 80px}
@keyframes monte{from{opacity:0; transform:translateY(18px)}to{opacity:1; transform:none}}
.vue > *{animation:monte .5s cubic-bezier(.16,1,.3,1) both}
.vue > *:nth-child(2){animation-delay:.06s} .vue > *:nth-child(3){animation-delay:.12s}
.vue > *:nth-child(4){animation-delay:.18s} .vue > *:nth-child(5){animation-delay:.24s}
.vue > *:nth-child(6){animation-delay:.3s} .vue > *:nth-child(7){animation-delay:.36s}
.vue > *:nth-child(8){animation-delay:.42s} .vue > *:nth-child(9){animation-delay:.48s}

.hero{position:relative; overflow:hidden; margin-top:24px; background:var(--carte);
  border:1px solid var(--trait); border-radius:22px; padding:24px 22px; box-shadow:var(--ombre)}
.hero::before{content:""; position:absolute; top:-90px; right:-70px; width:240px; height:240px;
  border-radius:50%; background:radial-gradient(circle,rgba(201,168,76,.14),transparent 68%)}
.hero::after{content:""; position:absolute; left:0; top:0; bottom:0; width:4px;
  background:linear-gradient(180deg,var(--or),var(--ambre))}
.hero .sur{position:relative; font-size:10px; letter-spacing:1.6px; text-transform:uppercase; color:var(--or-fonce); font-weight:800}
.hero h2{position:relative; margin:9px 0 11px; font-size:26px; font-weight:800; line-height:1.15}
.hero p{position:relative; margin:0; color:var(--plume); font-size:14.5px; line-height:1.7}
.hero p b{color:var(--encre); font-weight:700}
.puces{position:relative; display:flex; flex-direction:column; gap:10px; margin-top:18px; padding-top:18px; border-top:1px solid var(--trait)}
.puces span{display:flex; align-items:flex-start; gap:10px; font-size:13.5px; color:var(--encre); line-height:1.5}
.puces .k{color:var(--vert); flex:0 0 auto; margin-top:1px}
.prochaine{position:relative; display:inline-flex; align-items:center; gap:9px; margin-top:18px;
  background:var(--vert-fond); border:1px solid var(--vert-trait); border-radius:99px;
  padding:8px 15px 8px 12px; font-size:12.5px; font-weight:700; color:var(--vert)}

.bandeau-chiffres{display:flex; gap:1px; background:var(--trait); border:1px solid var(--trait);
  border-radius:16px; overflow:hidden; margin-top:20px; box-shadow:var(--ombre)}
.bc{flex:1; background:var(--carte); padding:14px 10px; text-align:center}
.bc .n{font-family:'Plus Jakarta Sans',sans-serif; font-weight:800; font-size:21px; letter-spacing:-.8px; line-height:1}
.bc .n.or{color:var(--or-fonce)}
.bc .l{font-size:10px; letter-spacing:.7px; text-transform:uppercase; color:var(--plume-clair); font-weight:700; margin-top:6px}
.sep{display:flex; align-items:center; gap:12px; margin:26px 0 14px}
.sep span{font-size:11px; font-weight:800; letter-spacing:1.4px; text-transform:uppercase; color:var(--plume-clair)}
.sep i{flex:1; height:1px; background:var(--trait)}

.grille{display:grid; grid-template-columns:repeat(2,1fr); gap:12px}
.case{position:relative; background:var(--carte); border:1px solid var(--trait); border-radius:20px;
  padding:18px 17px 16px; text-align:left; box-shadow:var(--ombre); width:100%; overflow:hidden;
  display:flex; flex-direction:column; gap:13px;
  transition:transform .24s cubic-bezier(.16,1,.3,1), box-shadow .24s ease, border-color .24s ease}
.case:hover{transform:translateY(-4px); box-shadow:var(--ombre-f); border-color:var(--trait-fort)}
.case:hover .ico{transform:translateY(-2px) rotate(-4deg)}
.case:hover .chev{transform:translateX(4px)}
.case:active{transform:scale(.982)}
.case.large{grid-column:1 / -1}
.ico{width:44px; height:44px; border-radius:14px; display:flex; align-items:center; justify-content:center;
  background:var(--fond); border:1px solid var(--trait); color:var(--encre2);
  transition:transform .32s cubic-bezier(.34,1.56,.64,1)}
.case h3{margin:0 0 4px; font-size:16px; font-weight:800; line-height:1.28}
.case p{margin:0; font-size:13px; color:var(--plume); line-height:1.5}
.chev{color:var(--plume-clair); transition:transform .24s cubic-bezier(.16,1,.3,1)}
.pied-case{display:flex; align-items:center; justify-content:space-between; gap:10px; margin-top:auto}
.case.phare{border-color:var(--ambre-trait); background:linear-gradient(150deg,var(--ambre-fond) 0%,var(--carte) 56%)}
.case.phare .ico{background:linear-gradient(140deg,var(--ambre-clair),var(--ambre)); border-color:var(--ambre);
  color:#fff; box-shadow:0 10px 20px -8px var(--ambre)}
.case.phare::before{content:""; position:absolute; top:-70px; right:-50px; width:190px; height:190px;
  border-radius:50%; background:radial-gradient(circle,rgba(224,130,46,.18),transparent 66%)}
.case.phare .badge{background:var(--ambre); box-shadow:0 6px 16px -4px var(--ambre)}
.case.phare .pied-case span:first-child{color:var(--ambre)}
.tete-case{display:flex; align-items:flex-start; justify-content:space-between; gap:12px; position:relative}
.badge{min-width:26px; height:26px; border-radius:99px; background:var(--or); color:#fff;
  font-family:'Plus Jakarta Sans',sans-serif; font-weight:800; font-size:13px;
  display:flex; align-items:center; justify-content:center; padding:0 8px;
  box-shadow:0 6px 16px -5px var(--or); animation:pop .55s cubic-bezier(.34,1.56,.64,1) both}
.badge.gris{background:var(--trait); color:var(--plume); box-shadow:none}
@keyframes pop{from{transform:scale(.3); opacity:0}to{transform:scale(1); opacity:1}}
.apercu{display:flex; flex-direction:column; gap:7px; position:relative}
.apl{display:flex; align-items:center; gap:9px; font-size:12.5px; color:var(--plume)}
.apl .pt{width:26px; height:26px; border-radius:7px; flex:0 0 auto; font-size:9px; overflow:hidden;
  background:linear-gradient(148deg,#3a5178,#22314c); color:rgba(255,255,255,.5);
  display:flex; align-items:center; justify-content:center}
.apl .pt img{width:100%; height:100%; object-fit:cover}
.apl b{color:var(--encre); font-weight:700}
.mini{display:flex; align-items:flex-end; gap:4px; height:34px}
.mini i{flex:1; background:var(--or-trait); border-radius:3px 3px 0 0; min-height:4px;
  animation:pousse .7s cubic-bezier(.16,1,.3,1) both; transform-origin:bottom}
.mini i.fort{background:var(--or)}
@keyframes pousse{from{transform:scaleY(.05); opacity:0}to{transform:scaleY(1); opacity:1}}

.chasseur{display:flex; align-items:center; gap:14px; background:var(--carte); border:1px solid var(--trait);
  border-radius:20px; padding:16px; box-shadow:var(--ombre)}
.chasseur .av{width:48px; height:48px; border-radius:50%; background:var(--encre); color:var(--or);
  display:flex; align-items:center; justify-content:center; font-family:'Plus Jakarta Sans',sans-serif;
  font-weight:800; font-size:16px; flex:0 0 auto}
.chasseur h4{margin:0; font-size:15px; font-weight:800}
.chasseur p{margin:2px 0 0; font-size:12.5px; color:var(--plume)}
.tel{margin-left:auto; background:var(--vert-fond); color:var(--vert); border:1px solid var(--vert-trait);
  border-radius:12px; padding:10px 14px; font-weight:800; font-size:13px; text-decoration:none;
  display:inline-flex; align-items:center; gap:7px; font-family:'Plus Jakarta Sans',sans-serif}
.engage{display:flex; flex-direction:column; gap:11px; background:var(--encre); color:var(--fond);
  border-radius:20px; padding:20px; box-shadow:var(--ombre)}
.engage .t{font-size:10px; letter-spacing:1.5px; text-transform:uppercase; color:var(--or); font-weight:800}
.engage div{display:flex; gap:11px; align-items:flex-start; font-size:13.5px; line-height:1.55}
.engage .k{color:var(--or); flex:0 0 auto; margin-top:1px}
.avis-lien{background:var(--fond); border:1px dashed var(--trait-fort); border-radius:16px;
  padding:14px 16px; font-size:12.5px; color:var(--plume); line-height:1.65; display:flex; gap:11px; align-items:flex-start}

.retour{display:inline-flex; align-items:center; gap:8px; background:var(--carte); border:1px solid var(--trait);
  border-radius:99px; padding:9px 16px 9px 12px; font-family:'Plus Jakarta Sans',sans-serif;
  font-weight:700; font-size:13.5px; color:var(--encre); margin:22px 0 18px; box-shadow:var(--ombre);
  transition:transform .18s cubic-bezier(.16,1,.3,1), box-shadow .18s, border-color .18s}
.retour:hover{border-color:var(--trait-fort); box-shadow:var(--ombre-f)}
.retour:active{transform:scale(.95)}
.tete-vue{display:flex; align-items:center; gap:13px; margin-bottom:8px}
.tete-vue .ico{width:46px; height:46px; border-radius:15px}
.tete-vue h2{margin:0; font-size:22px; font-weight:800; line-height:1.2}
.sous-vue{color:var(--plume); font-size:14.5px; margin:0 0 22px; line-height:1.65}
.bloc-titre{display:flex; align-items:center; gap:10px; margin:28px 0 13px}
.bloc-titre h3{margin:0; font-size:16px; font-weight:800}
.bloc-titre .n{background:var(--trait); color:var(--plume); border-radius:99px; padding:1px 9px;
  font-size:12px; font-weight:800; font-family:'Plus Jakarta Sans',sans-serif}
.bloc-titre .n.or{background:var(--ambre); color:#fff}

.liste{display:flex; flex-direction:column; gap:11px}
.bien{display:grid; grid-template-columns:88px minmax(0,1fr) auto; gap:14px; align-items:center;
  background:var(--carte); border:1px solid var(--trait); border-radius:18px; padding:11px;
  text-align:left; width:100%; box-shadow:var(--ombre); position:relative; overflow:hidden;
  transition:transform .2s cubic-bezier(.16,1,.3,1), box-shadow .2s ease, border-color .2s ease}
.bien:hover{transform:translateY(-3px); border-color:var(--trait-fort); box-shadow:var(--ombre-f)}
.bien:hover .fleche{transform:translateX(4px)}
.bien:active{transform:scale(.99)}
.bien.neuf{border-color:var(--ambre-trait)}
.bien.neuf::before{content:""; position:absolute; left:0; top:0; bottom:0; width:3px; background:var(--ambre)}
.vignette{width:88px; height:88px; border-radius:13px; display:flex; align-items:center; justify-content:center;
  flex:0 0 auto; overflow:hidden; background:linear-gradient(148deg,#3a5178,#22314c); color:rgba(255,255,255,.5)}
.vignette img{width:100%; height:100%; object-fit:cover}
.haut-bien{display:flex; align-items:center; gap:8px; margin-bottom:5px; flex-wrap:wrap}
.dat{font-size:11px; font-weight:700; color:var(--plume-clair)}
.bien h4{margin:0 0 4px; font-size:15px; font-weight:800; line-height:1.3;
  display:-webkit-box; -webkit-line-clamp:2; -webkit-box-orient:vertical; overflow:hidden}
.bien .meta{font-size:12.5px; color:var(--plume); display:block}
.bien .prix{font-family:'Plus Jakarta Sans',sans-serif; font-size:17.5px; font-weight:800; color:var(--or-fonce);
  line-height:1; margin-top:7px; letter-spacing:-.5px}
.fleche{color:var(--plume-clair); padding-right:4px; transition:transform .2s cubic-bezier(.16,1,.3,1)}
.etiq{display:inline-flex; align-items:center; gap:5px; border-radius:99px; padding:3px 10px;
  font-size:11px; font-weight:800; border:1px solid transparent}
.etiq.neuf{background:var(--ambre); color:#fff}
.etiq.vu{background:var(--bleu-fond); color:var(--bleu); border-color:var(--bleu-trait)}
.etiq.oui{background:var(--vert-fond); color:var(--vert); border-color:var(--vert-trait)}
.etiq.visite{background:var(--prune-fond); color:var(--prune); border-color:var(--prune-trait)}
.etiq.non{background:var(--brique-fond); color:var(--brique); border-color:var(--brique-trait)}
.relance{background:var(--or-fond); border:1px solid var(--or-trait); border-radius:16px;
  padding:14px 16px; font-size:13.5px; color:var(--or-fonce); display:flex; gap:11px; align-items:flex-start; margin-bottom:12px}
.vide-sec{color:var(--plume-clair); font-size:14px; padding:26px 16px; text-align:center;
  background:var(--carte); border:1px dashed var(--trait-fort); border-radius:16px; line-height:1.6}

.tuiles{display:grid; grid-template-columns:repeat(2,1fr); gap:1px; background:var(--trait);
  border:1px solid var(--trait); border-radius:18px; overflow:hidden; box-shadow:var(--ombre)}
.tuile{background:var(--carte); padding:18px 16px}
.tuile .n{font-family:'Plus Jakarta Sans',sans-serif; font-size:29px; font-weight:800; line-height:1; letter-spacing:-1.2px}
.tuile .n.or{color:var(--or-fonce)} .tuile .n.pale{color:var(--plume-clair)}
.tuile .l{font-size:10.5px; letter-spacing:.9px; text-transform:uppercase; color:var(--plume-clair); margin-top:8px; font-weight:700}
.note{font-size:14px; color:var(--plume); margin-top:16px; line-height:1.7}
.graphe{background:var(--carte); border:1px solid var(--trait); border-radius:18px; padding:18px; box-shadow:var(--ombre); margin-top:12px}
.barres{display:flex; align-items:flex-end; gap:7px; height:110px; margin-top:14px}
.barre{flex:1; display:flex; flex-direction:column; align-items:center; gap:7px; height:100%; justify-content:flex-end}
.barre i{width:100%; background:var(--or-trait); border-radius:5px 5px 0 0; min-height:5px;
  animation:pousse .8s cubic-bezier(.16,1,.3,1) both; transform-origin:bottom}
.barre.auj i{background:var(--or)}
.barre b{font-family:'Plus Jakarta Sans',sans-serif; font-size:11px; font-weight:800; color:var(--encre)}
.barre span{font-size:10px; color:var(--plume-clair); font-weight:700; text-transform:uppercase}

.bloc{background:var(--carte); border:1px solid var(--trait); border-radius:18px; padding:18px; box-shadow:var(--ombre)}
.bloc + .bloc{margin-top:12px}
.bloc .t{display:flex; align-items:center; gap:9px; font-size:10.5px; letter-spacing:1.3px; text-transform:uppercase;
  color:var(--plume-clair); font-weight:800; margin-bottom:13px}
.gros{font-family:'Plus Jakarta Sans',sans-serif; font-size:26px; font-weight:800; letter-spacing:-1px; line-height:1.1}
.gros small{font-size:14px; font-weight:700; color:var(--plume); letter-spacing:0}
.trio{display:grid; grid-template-columns:repeat(3,1fr); gap:10px}
.mini-t{background:var(--fond); border:1px solid var(--trait); border-radius:14px; padding:13px 8px; text-align:center}
.mini-t .v{font-family:'Plus Jakarta Sans',sans-serif; font-weight:800; font-size:18px; letter-spacing:-.5px}
.mini-t .l{font-size:9.5px; letter-spacing:.8px; text-transform:uppercase; color:var(--plume-clair); margin-top:4px; font-weight:700}
.pastilles{display:flex; flex-wrap:wrap; gap:7px}
.past{background:var(--fond); border:1px solid var(--trait); border-radius:99px; padding:6px 13px; font-size:13px; font-weight:600}
.past.or{background:var(--or-fond); border-color:var(--or-trait); color:var(--or-fonce); font-weight:700}
.precisions{background:var(--carte); border:1px solid var(--trait); border-radius:18px; padding:18px; margin-top:12px; box-shadow:var(--ombre)}
.precisions .k{display:flex; align-items:center; gap:8px; font-size:10.5px; letter-spacing:1.3px; text-transform:uppercase;
  color:var(--plume-clair); font-weight:800; margin-bottom:12px}
.precisions .corps{background:var(--fond); border:1px solid var(--trait); border-radius:14px;
  padding:15px 16px; font-size:14px; line-height:1.75; color:var(--plume); white-space:pre-line}
.precisions .verrou{display:flex; align-items:center; gap:7px; font-size:11.5px; color:var(--plume-clair); margin-top:11px; font-weight:600}
.cta-prec{display:flex; align-items:center; justify-content:space-between; gap:12px; width:100%;
  margin-top:14px; background:var(--or-fond); border:1px solid var(--or-trait); border-radius:14px;
  padding:14px 16px; text-align:left;
  transition:transform .18s cubic-bezier(.16,1,.3,1), box-shadow .18s, border-color .18s}
.cta-prec:hover{border-color:var(--or); box-shadow:var(--ombre-f)}
.cta-prec:hover .chev{transform:translateX(4px)}
.cta-prec:active{transform:scale(.985)}
.cta-prec b{display:block; font-family:'Plus Jakarta Sans',sans-serif; font-size:14px; font-weight:800; color:var(--or-fonce)}
.cta-prec span.s{display:block; font-size:12.5px; color:var(--plume); margin-top:3px}

.btn{display:inline-flex; align-items:center; justify-content:center; gap:8px; border-radius:14px;
  padding:15px 20px; font-family:'Plus Jakarta Sans',sans-serif; font-size:14.5px; font-weight:800;
  border:1px solid transparent; width:100%; text-decoration:none;
  transition:transform .16s cubic-bezier(.16,1,.3,1), box-shadow .16s ease}
.btn:active{transform:scale(.982)}
.btn.or{background:var(--or); color:#fff; box-shadow:0 12px 24px -12px var(--or)}
.btn.fant{background:var(--carte); color:var(--encre); border-color:var(--trait-fort)}
.btn.encre{background:var(--encre); color:var(--fond)}
.btn.lien{background:none; border:none; color:var(--plume); font-weight:700; font-size:13.5px; padding:12px; width:auto}
.duo{display:flex; gap:10px; margin-top:18px}
.duo .btn{flex:1}

.voile{position:fixed; inset:0; background:rgba(12,17,24,.55); backdrop-filter:blur(3px);
  opacity:0; pointer-events:none; transition:opacity .3s ease; z-index:60}
.voile.on{opacity:1; pointer-events:auto}
.feuille{position:fixed; left:0; right:0; bottom:0; z-index:61; background:var(--carte);
  border-radius:26px 26px 0 0; max-height:92vh; overflow-y:auto; overscroll-behavior:contain;
  transform:translateY(102%); transition:transform .44s cubic-bezier(.16,1,.28,1);
  padding-bottom:calc(22px + env(safe-area-inset-bottom,0px)); box-shadow:0 -12px 40px rgba(12,17,24,.32)}
.feuille.on{transform:translateY(0)}
@media(min-width:640px){
  .feuille{left:50%; right:auto; bottom:auto; top:50%; width:570px; max-height:88vh; border-radius:24px;
    transform:translate(-50%,-44%) scale(.97); opacity:0}
  .feuille.on{transform:translate(-50%,-50%) scale(1); opacity:1}
}
.poignee{width:40px; height:4px; border-radius:99px; background:var(--trait-fort); margin:10px auto 0}
@media(min-width:640px){.poignee{display:none}}
.tete-f{display:flex; align-items:flex-start; justify-content:space-between; gap:14px; padding:16px 20px 12px}
.tete-f h3{margin:0; font-size:19px; font-weight:800; line-height:1.28}
.tete-f .sur{font-size:10px; letter-spacing:1.3px; text-transform:uppercase; color:var(--plume-clair); font-weight:800; margin-bottom:5px}
.fermer{background:var(--fond); border:1px solid var(--trait); border-radius:50%; width:33px; height:33px;
  flex:0 0 auto; color:var(--plume); display:flex; align-items:center; justify-content:center}
.corps-f{padding:0 20px}
.photo-h{position:relative; width:100%; aspect-ratio:3/2; display:flex; align-items:center; justify-content:center;
  background:linear-gradient(148deg,#3a5178,#22314c); color:rgba(255,255,255,.5); overflow:hidden}
.photo-h img{width:100%; height:100%; object-fit:cover}
.points{position:absolute; bottom:10px; left:0; right:0; display:flex; justify-content:center; gap:5px}
.points button{width:6px; height:6px; border-radius:99px; background:rgba(255,255,255,.5); padding:0;
  transition:width .3s cubic-bezier(.16,1,.3,1), background .3s}
.points button.on{width:16px; background:#fff}
.bandeau-prix{display:flex; align-items:baseline; justify-content:space-between; gap:12px; padding:16px 20px 0}
.bandeau-prix .p{font-family:'Plus Jakarta Sans',sans-serif; font-size:27px; font-weight:800; color:var(--or-fonce); letter-spacing:-1px}
.bandeau-prix .m2{font-size:12.5px; color:var(--plume-clair); font-weight:700}
.specs{display:grid; grid-template-columns:repeat(auto-fit,minmax(86px,1fr)); gap:8px; margin:16px 0 4px}
.spec{background:var(--fond); border:1px solid var(--trait); border-radius:13px; padding:11px 8px; text-align:center}
.spec .v{font-family:'Plus Jakarta Sans',sans-serif; font-weight:800; font-size:15px}
.spec .l{font-size:9px; letter-spacing:.9px; text-transform:uppercase; color:var(--plume-clair); margin-top:4px; font-weight:700}
.txt{font-size:14.5px; line-height:1.7; margin:14px 0 0}
.dpe{display:inline-flex; align-items:center; gap:7px; margin-right:14px; margin-top:14px}
.dpe .l{width:26px; height:26px; border-radius:8px; display:flex; align-items:center; justify-content:center;
  font-family:'Plus Jakarta Sans',sans-serif; font-weight:800; font-size:14px; color:#1a2332}
.dpe .t{font-size:10.5px; letter-spacing:.9px; text-transform:uppercase; color:var(--plume-clair); font-weight:800}
.avis3{display:grid; grid-template-columns:repeat(3,1fr); gap:9px; margin-top:8px}
.avis{background:var(--fond); border:2px solid var(--trait); border-radius:16px; padding:14px 6px;
  display:flex; flex-direction:column; align-items:center; gap:7px;
  transition:transform .22s cubic-bezier(.16,1,.3,1), border-color .2s, background .2s}
.avis .e{font-size:23px; line-height:1}
.avis .n{font-size:12px; font-weight:700; color:var(--plume); text-align:center; line-height:1.3}
.avis:active{transform:scale(.95)}
.avis[aria-pressed="true"]{transform:translateY(-3px)}
.avis[data-a="oui"][aria-pressed="true"]{border-color:var(--vert); background:var(--vert-fond)}
.avis[data-a="oui"][aria-pressed="true"] .n{color:var(--vert)}
.avis[data-a="visite"][aria-pressed="true"]{border-color:var(--prune); background:var(--prune-fond)}
.avis[data-a="visite"][aria-pressed="true"] .n{color:var(--prune)}
.avis[data-a="non"][aria-pressed="true"]{border-color:var(--brique); background:var(--brique-fond)}
.avis[data-a="non"][aria-pressed="true"] .n{color:var(--brique)}
textarea,input[type="email"]{width:100%; border:1px solid var(--trait-fort); border-radius:13px; padding:13px;
  font-family:inherit; font-size:15px; color:var(--encre); background:var(--fond); resize:vertical}
textarea:focus,input:focus{outline:none; border-color:var(--or); background:var(--carte)}
label.lab{display:block; font-size:10px; letter-spacing:1.3px; text-transform:uppercase;
  color:var(--plume-clair); font-weight:800; margin:18px 0 8px}
.fige{background:var(--fond); border:1px solid var(--trait); border-radius:13px; padding:13px;
  font-size:13.5px; color:var(--plume); line-height:1.65}
.pas{display:flex; align-items:center; justify-content:space-between; gap:10px;
  background:var(--fond); border:1px solid var(--trait); border-radius:14px; padding:8px 10px}
.pas .val{font-family:'Plus Jakarta Sans',sans-serif; font-weight:800; font-size:19px; flex:1; text-align:center; letter-spacing:-.5px}
.rond{width:34px; height:34px; border-radius:50%; border:1px solid var(--trait-fort); background:var(--carte);
  font-size:19px; line-height:1; display:flex; align-items:center; justify-content:center; flex:0 0 auto;
  transition:transform .16s cubic-bezier(.16,1,.3,1)}
.rond:active{transform:scale(.87)}
.jauge{height:6px; border-radius:99px; background:var(--trait); margin-top:11px; overflow:hidden}
.jauge i{display:block; height:100%; background:var(--or); border-radius:99px;
  transition:width .42s cubic-bezier(.16,1,.3,1), margin-left .42s cubic-bezier(.16,1,.3,1)}
.choix{display:flex; flex-wrap:wrap; gap:7px}
.ch{background:var(--fond); border:1.5px solid var(--trait); border-radius:99px; padding:9px 15px;
  font-size:13.5px; font-weight:700; color:var(--plume);
  transition:transform .2s cubic-bezier(.34,1.56,.64,1), border-color .18s, background .18s, color .18s}
.ch:active{transform:scale(.93)}
.ch[aria-pressed="true"]{background:var(--encre); border-color:var(--encre); color:var(--fond)}
.ch.or[aria-pressed="true"]{background:var(--or); border-color:var(--or); color:#fff}
.grandok{text-align:center; padding:8px 24px 26px}
.grandok .rond-ok{width:76px; height:76px; border-radius:50%; margin:14px auto 20px;
  background:var(--vert-fond); color:var(--vert); display:flex; align-items:center; justify-content:center;
  border:2px solid var(--vert-trait); animation:pop .6s cubic-bezier(.34,1.56,.64,1) both}
.grandok h3{margin:0 0 12px; font-size:22px; font-weight:800; line-height:1.25}
.grandok p{margin:0 auto; max-width:380px; color:var(--plume); font-size:14.5px; line-height:1.7}
.grandok .rappel{margin-top:18px; background:var(--fond); border:1px solid var(--trait); border-radius:14px;
  padding:14px 16px; font-size:13px; color:var(--plume); line-height:1.6}
.grandok .rappel b{color:var(--encre)}
.pied{text-align:center; padding:34px 20px 10px; color:var(--plume-clair); font-size:12px; line-height:1.8}
.pied b{color:var(--plume); font-weight:700}
@media (prefers-reduced-motion:reduce){*{animation-duration:.01ms !important; transition-duration:.01ms !important}}
`;
