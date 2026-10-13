'use client';
import { useState, useRef } from 'react';
import { AIMES, PHOTOS_MAX, lienPropre, etatAnnonce, type AnnonceEspace } from '@/lib/annonces-client';

/**
 * « Une annonce repérée ? » — dans l'espace du client (V3.184, maquette 1A).
 *
 *   CarteAnnonce   la carte de l'accueil : envoyer, le « ? », et sa dernière
 *                  annonce avec ce qu'Alexandre en fait ;
 *   EnvoiAnnonce   la fenêtre d'envoi : le lien, une photo (une affiche en
 *                  vitrine, un panneau), ce qui lui plaît, un mot ;
 *   ListeAnnonces  « Vos annonces envoyées », toutes, avec les réponses.
 *
 * Les icônes viennent de la table de l'espace (EspaceClient), par `Ico`.
 * Les données : src/lib/annonces-client.ts.
 */

type IcoT = (p: { n: string; t?: number }) => React.ReactElement | null;

const MOIS = ['janv.', 'févr.', 'mars', 'avril', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];
/* « aujourd'hui », « hier », « le 10 oct. » */
function quand(d: string) {
  const x = new Date(d); if (isNaN(x.getTime())) return '';
  const minuit = (v: Date) => new Date(v.getFullYear(), v.getMonth(), v.getDate()).getTime();
  const j = Math.round((minuit(new Date()) - minuit(x)) / 86400000);
  if (j <= 0) return 'aujourd’hui';
  if (j === 1) return 'hier';
  return `le ${x.getDate()} ${MOIS[x.getMonth()]}`;
}

/* La petite image d'une annonce : la photo du bien, la sienne, ou un lien. */
function Vignette({ a, Ico, grande }: { a: AnnonceEspace; Ico: IcoT; grande?: boolean }) {
  return (
    <span className={'ra-vig' + (grande ? ' grande' : '') + (a.photo ? '' : ' vide')}>
      {a.photo ? <img src={a.photo} alt="" loading="lazy" /> : <Ico n="lien" t={grande ? 20 : 16} />}
    </span>
  );
}

/* ══ la carte de l'accueil ══════════════════════════════════════════
   Sur téléphone, juste après « Nouveaux biens pour vous » ; sur ordinateur,
   en haut de la colonne de droite (voir Accueil dans EspaceClient). */
export function CarteAnnonce({ annonces, peutEnvoyer, onEnvoyer, onAide, onToutes, Ico }: {
  annonces: AnnonceEspace[]; peutEnvoyer: boolean;
  onEnvoyer: () => void; onAide: () => void; onToutes: () => void; Ico: IcoT;
}) {
  const der = annonces[0];
  const e = der ? etatAnnonce(der) : null;
  return (
    <div className="ra-carte">
      <div className="ra-haut">
        <span className="ra-ic"><Ico n="lien" t={20} /></span>
        <div className="ra-tx">
          <b className="ra-t">{'Une annonce repérée ?'}</b>
          <span className="ra-s">{peutEnvoyer ? 'Envoyez-la à Alexandre, il vous dit ce qu’il en pense' : 'Ce qu’Alexandre a pensé de celles que vous lui avez envoyées'}</span>
          {peutEnvoyer && (
            <button type="button" className="ra-env" onClick={onEnvoyer}>
              <Ico n="plus" t={15} /><span>Envoyer une annonce</span>
            </button>
          )}
        </div>
        <button type="button" className="ra-aide" aria-label="À quoi ça sert ?" onClick={onAide}>?</button>
      </div>
      {der && e && (
        <button type="button" className="ra-der" onClick={onToutes}>
          <span className="ra-der-h">
            <span>Votre dernière annonce</span>
            <span className="ra-voir">{annonces.length > 1 ? `Voir les ${annonces.length}` : 'Voir'}<Ico n="fleche" t={14} /></span>
          </span>
          <span className="ra-der-l">
            <Vignette a={der} Ico={Ico} />
            <span className="ra-der-tx">
              <b>{der.titre}</b>
              <span className={'ra-etat ' + e.ton}><i />{e.lib}</span>
            </span>
          </span>
        </button>
      )}
    </div>
  );
}

/* ══ la fenêtre d'envoi ═════════════════════════════════════════════ */

/* Une photo de téléphone pèse plusieurs Mo : on la réduit ici (1 600 px,
   JPEG) avant de l'envoyer. Une image que le navigateur ne sait pas lire
   (un HEIC sur ordinateur) : null. */
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
    return c.toDataURL('image/jpeg', 0.82);
  } catch { return null; } finally { URL.revokeObjectURL(adresse); }
}

export type EnvoiAnnonceDonnees = { url: string; photos: string[]; aime: string[]; mot: string };
export type ResultatEnvoi = 'ok' | 'lien' | 'photo' | 'trop' | 'erreur';

const ERREURS: Record<string, string> = {
  vide: 'Collez le lien de l’annonce, ou ajoutez une photo.',
  lien: 'Ce n’est pas le lien d’une page. Copiez l’adresse de l’annonce (elle commence par https://), ou ajoutez une photo.',
  photo: 'Une photo n’a pas pu partir. Retirez-la, ou réessayez dans un instant.',
  illisible: 'Cette photo n’a pas pu être lue. Essayez-en une autre.',
  trop: 'Vous avez déjà envoyé beaucoup d’annonces aujourd’hui. Réessayez demain, ou appelez Alexandre.',
  erreur: 'Ce n’est pas parti : un souci de connexion, sans doute. Ce que vous avez saisi est gardé, réessayez dans un instant.',
};

export function EnvoiAnnonce({ onFermer, onEnvoyer, Ico }: {
  onFermer: () => void; onEnvoyer: (d: EnvoiAnnonceDonnees) => Promise<ResultatEnvoi>; Ico: IcoT;
}) {
  const [lien, setLien] = useState('');
  const [photos, setPhotos] = useState<string[]>([]);
  const [aime, setAime] = useState<string[]>([]);
  const [mot, setMot] = useState('');
  const [envoi, setEnvoi] = useState(false);
  const [lecture, setLecture] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  /* Au doigt : « Prendre une photo » et « Depuis la galerie ». À la souris,
     un seul bouton : l'appareil photo n'a pas de sens sur un ordinateur. */
  /* La fenêtre ne s'ouvre qu'après un appui : on est toujours dans le navigateur ici. */
  const [tactile] = useState(() => {
    try { return window.matchMedia('(pointer: coarse)').matches; } catch { return true; }
  });
  const [peutColler] = useState(() => typeof navigator !== 'undefined' && !!navigator.clipboard?.readText);
  const appareil = useRef<HTMLInputElement>(null);
  const galerie = useRef<HTMLInputElement>(null);

  const reste = PHOTOS_MAX - photos.length;
  async function ajouter(liste: FileList | null) {
    if (!liste || !liste.length || reste <= 0) return;
    setLecture(true); setErreur(null);
    const nouvelles: string[] = [];
    let rate = false;
    for (const f of Array.from(liste).slice(0, reste)) {
      const d = await reduire(f);
      if (d) nouvelles.push(d); else rate = true;
    }
    setPhotos(p => [...p, ...nouvelles].slice(0, PHOTOS_MAX));
    if (rate) setErreur('illisible');
    setLecture(false);
  }
  async function coller() {
    try {
      const t = await navigator.clipboard.readText();
      if (t) { setLien(t.trim()); setErreur(null); }
    } catch { /* refusé : il colle à la main */ }
  }
  async function partir() {
    const l = lien.trim();
    if (l && !lienPropre(l)) { setErreur('lien'); return; }
    if (!l && !photos.length) { setErreur('vide'); return; }
    setEnvoi(true); setErreur(null);
    const r = await onEnvoyer({ url: l, photos, aime, mot: mot.trim() });
    if (r !== 'ok') { setEnvoi(false); setErreur(r); }
  }

  return (
    <>
      <div className="tete-f">
        <div><div className="sur">Une annonce repérée</div><h3>Envoyer une annonce à Alexandre</h3></div>
        <button className="fermer" onClick={onFermer} aria-label="Fermer"><Ico n="croix" t={14} /></button>
      </div>
      <div className="corps-f ra-f">
        <p className="ra-f-int">{'Le lien de l’annonce. Pas de lien ? Une photo suffit.'}</p>

        <label className="ra-f-l" htmlFor="ra-lien">Le lien de l’annonce</label>
        <div className="ra-f-lien">
          <input id="ra-lien" type="url" inputMode="url" autoComplete="off" autoCapitalize="off" spellCheck={false}
            value={lien} onChange={ev => { setLien(ev.target.value); if (erreur) setErreur(null); }}
            placeholder="https://www.leboncoin.fr/…" />
          {peutColler && <button type="button" className="ra-f-coller" onClick={coller}>Coller</button>}
        </div>

        <div className="ra-f-sep"><i /><span>et, si vous voulez</span><i /></div>

        <div className="ra-f-l">Une photo <em>· facultatif</em></div>
        <p className="ra-f-aide">{'Vous avez vu une affiche en vitrine, un panneau « À vendre », une annonce sur Instagram ? Prenez-la en photo.'}</p>
        {reste > 0 && (
          <div className={'ra-f-ph' + (tactile ? '' : ' un')}>
            {tactile && (
              <button type="button" onClick={() => appareil.current?.click()} disabled={lecture}>
                <Ico n="photo" t={20} /><span>Prendre une photo</span>
              </button>
            )}
            <button type="button" onClick={() => galerie.current?.click()} disabled={lecture}>
              <Ico n="galerie" t={20} /><span>{tactile ? 'Depuis la galerie' : 'Ajouter une photo'}</span>
            </button>
          </div>
        )}
        <input ref={appareil} type="file" accept="image/*" capture="environment" hidden
          onChange={ev => { void ajouter(ev.target.files); ev.target.value = ''; }} />
        <input ref={galerie} type="file" accept="image/*" multiple hidden
          onChange={ev => { void ajouter(ev.target.files); ev.target.value = ''; }} />
        {(photos.length > 0 || lecture) && (
          <div className="ra-f-vigs">
            {photos.map((p, i) => (
              <span key={i} className="ra-f-vig">
                <img src={p} alt="" />
                <button type="button" aria-label="Retirer cette photo" onClick={() => setPhotos(l => l.filter((_, j) => j !== i))}>
                  <Ico n="croix" t={11} />
                </button>
              </span>
            ))}
            {lecture && <span className="ra-f-vig attente" aria-label="Photo en préparation" />}
          </div>
        )}

        <div className="ra-f-l">Ce qui vous plaît <em>· facultatif</em></div>
        <div className="ra-f-aime" role="group" aria-label="Ce qui vous plaît">
          {AIMES.map(x => {
            const on = aime.includes(x);
            return (
              <button key={x} type="button" aria-pressed={on} className={on ? 'on' : undefined}
                onClick={() => setAime(l => (on ? l.filter(y => y !== x) : [...l, x]))}>{x}</button>
            );
          })}
        </div>

        <label className="ra-f-l" htmlFor="ra-mot">Un mot pour Alexandre <em>· facultatif</em></label>
        <textarea id="ra-mot" rows={3} value={mot} onChange={ev => setMot(ev.target.value)} maxLength={800}
          placeholder="Ex. : un peu au-dessus du budget, mais l’extérieur est superbe. Qu’en pensez-vous ?" />

        <button type="button" className="btn or ra-f-go" onClick={partir} disabled={envoi || lecture}>
          {envoi ? <><span className="tourne" />Envoi en cours…</> : 'Envoyer à Alexandre'}
        </button>
        {erreur && <div role="alert" className="ra-f-err">{ERREURS[erreur] || ERREURS.erreur}</div>}
        <p className="ra-f-pied">{'Vous suivez sa réponse sur votre accueil, dans « Votre dernière annonce ».'}</p>
      </div>
    </>
  );
}

/* ══ « Vos annonces envoyées » ══════════════════════════════════════ */
export function ListeAnnonces({ annonces, peutEnvoyer, onEnvoyer, onBien, Ico }: {
  annonces: AnnonceEspace[]; peutEnvoyer: boolean; onEnvoyer: () => void; onBien: (id: string) => void; Ico: IcoT;
}) {
  return (
    <div className="ra-page">
      {peutEnvoyer && (
        <button type="button" className="ra-autre" onClick={onEnvoyer}>
          <Ico n="plus" t={16} /><span>{annonces.length ? 'Envoyer une autre annonce' : 'Envoyer une annonce'}</span>
        </button>
      )}
      {annonces.length === 0 ? (
        <div className="vide-sec">{'Vous n’avez pas encore envoyé d’annonce.'}<br />{'Un bien vu ailleurs vous plaît ? Envoyez-le à Alexandre : il vous dit ce qu’il en pense.'}</div>
      ) : (
        <div className="ra-liste">
          {annonces.map(a => {
            const e = etatAnnonce(a);
            /* Le site, quand le titre ne le dit pas déjà (une fiche remplie). */
            const origine = a.bienId ? a.site || (a.photos.length > 1 ? 'vos photos' : 'votre photo') : null;
            return (
              <div key={a.id} className="ra-l">
                <div className="ra-l-h">
                  <Vignette a={a} Ico={Ico} grande />
                  <div className="ra-l-tx">
                    <b>{a.titre}</b>
                    <span className="ra-l-m">{`Envoyée ${quand(a.le)}${origine ? ` · ${origine}` : ''}`}</span>
                    <span className={'ra-etat ' + e.ton}><i />{a.statut === 'ecarte' ? 'Pas retenue' : e.lib}</span>
                  </div>
                </div>
                {a.statut === 'ecarte' && (
                  a.reponse
                    ? <div className="ra-rep"><span>{`« ${a.reponse} »`}</span><i>Alexandre</i></div>
                    : <div className="ra-rep vide">{'Alexandre ne l’a pas retenue pour vous.'}</div>
                )}
                {a.statut === 'retenu' && a.avis && (
                  <div className="ra-rep vert"><span>{`« ${a.avis} »`}</span><i>Alexandre</i></div>
                )}
                {(a.mot || a.aime.length > 0) && (
                  <div className="ra-mot">
                    {a.mot && <span>{`Votre mot : « ${a.mot} »`}</span>}
                    {a.aime.length > 0 && <span className="ra-mot-a">{`Ce qui vous plaît : ${a.aime.join(', ').toLowerCase()}`}</span>}
                  </div>
                )}
                {(a.bienId || a.url) && (
                  <div className="ra-l-b">
                    {a.bienId && (
                      <button type="button" className="ra-voir-b" onClick={() => onBien(a.bienId as string)}>
                        <span>Voir le bien</span><Ico n="fleche" t={15} />
                      </button>
                    )}
                    {a.url && !a.bienId && (
                      <a className="ra-revoir" href={a.url} target="_blank" rel="noopener noreferrer">
                        <span>{'Revoir l’annonce'}</span><Ico n="fleche" t={15} />
                      </a>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

/* ══ styles ═════════════════════════════════════════════════════════ */
export const CSS_ANNONCES = `
/* — la carte de l'accueil (maquette 1A) — */
.ra-carte{background:var(--carte); border:1px solid var(--trait); border-radius:20px; overflow:hidden; box-shadow:var(--ombre)}
.ra-haut{display:flex; align-items:flex-start; gap:12px; padding:14px 12px 14px 16px}
.ra-ic{width:40px; height:40px; border-radius:12px; background:var(--or-fond); color:var(--or-fonce);
  display:flex; align-items:center; justify-content:center; flex:0 0 auto}
.ra-tx{flex:1 1 auto; min-width:0; display:flex; flex-direction:column; align-items:flex-start}
.ra-t{font-size:15px; font-weight:800; line-height:1.3; margin-top:1px}
.ra-s{font-size:12.5px; color:var(--plume); line-height:1.45; margin-top:2px}
.ra-env{display:inline-flex; align-items:center; gap:6px; height:34px; margin-top:10px; padding:0 13px 0 10px;
  border-radius:99px; border:1.5px solid #F2C08A; background:#FFF8EF; color:var(--or-fonce);
  font-size:13px; font-weight:800; -webkit-tap-highlight-color:transparent; transition:background .15s}
.ra-env:hover{background:var(--or-fond)}
.ra-aide{width:24px; height:24px; border-radius:50%; border:1.5px solid #C9D6E8; background:var(--carte);
  color:var(--encre2); font-size:12px; font-weight:800; display:flex; align-items:center; justify-content:center;
  flex:0 0 auto; padding:0}
.ra-aide:hover{color:var(--or-fonce); border-color:var(--or-trait); background:var(--or-fond)}
.ra-der{display:flex; flex-direction:column; gap:8px; width:100%; padding:10px 14px 12px 16px; border-top:1px solid #EEF2F7;
  background:#FAFBFD; text-align:left; -webkit-tap-highlight-color:transparent}
.ra-der:hover{background:#F5F8FC}
.ra-der-h{display:flex; align-items:center; justify-content:space-between; gap:10px; font-size:11px; font-weight:800;
  letter-spacing:.8px; text-transform:uppercase; color:#6B7A90}
.ra-voir{display:inline-flex; align-items:center; gap:1px; letter-spacing:0; text-transform:none; font-size:12.5px; color:var(--encre2); white-space:nowrap}
.ra-der-l{display:flex; align-items:center; gap:11px; min-width:0}
.ra-der-tx{display:flex; flex-direction:column; gap:2px; min-width:0}
.ra-der-tx b{font-size:13.5px; font-weight:700; white-space:nowrap; overflow:hidden; text-overflow:ellipsis}
.ra-vig{width:44px; height:34px; border-radius:8px; overflow:hidden; flex:0 0 auto; background:#E8EFF8; color:var(--encre2);
  display:flex; align-items:center; justify-content:center}
.ra-vig img{width:100%; height:100%; object-fit:cover; display:block}
.ra-vig.grande{width:64px; height:50px; border-radius:11px}
.ra-etat{display:inline-flex; align-items:center; gap:6px; font-size:12px; font-weight:800; line-height:1.3}
.ra-etat i{width:6px; height:6px; border-radius:50%; flex:0 0 auto; background:currentColor}
.ra-etat.or{color:var(--or-fonce)} .ra-etat.or i{background:var(--or)}
.ra-etat.vert{color:var(--vert)}
.ra-etat.gris{color:var(--plume)} .ra-etat.gris i{background:var(--plume-clair)}
/* Au téléphone, sous « Nouveaux biens pour vous » (l'ordinateur la pose en
   haut de la colonne de droite, sans marge : l'écart de la colonne suffit). */
.ra-tel{margin-top:22px}

/* — la fenêtre d'envoi — */
.ra-f{display:flex; flex-direction:column}
.ra-f-int{margin:0 0 4px; color:var(--plume); font-size:14px; line-height:1.5}
.ra-f-l{display:block; font-size:13px; font-weight:800; color:var(--encre); margin:16px 0 7px}
.ra-f-l em{font-style:normal; font-weight:600; color:var(--plume-clair)}
.ra-f-lien{display:flex; gap:8px}
.ra-f-lien input{flex:1 1 auto; min-width:0; height:48px; border:1.5px solid var(--trait-fort); border-radius:13px; padding:0 13px;
  font-family:inherit; font-size:15px; color:var(--encre); background:var(--fond)}
.ra-f-lien input:focus{outline:none; border-color:var(--or); background:var(--carte)}
.ra-f-coller{height:48px; padding:0 14px; border-radius:13px; border:1px solid var(--bleu-trait); background:var(--fond);
  color:var(--encre2); font-size:13.5px; font-weight:800; flex:0 0 auto}
.ra-f-sep{display:flex; align-items:center; gap:10px; margin:18px 0 0; color:var(--plume-clair); font-size:12.5px; font-weight:700}
.ra-f-sep i{flex:1 1 auto; height:1px; background:var(--trait)}
.ra-f-aide{margin:-3px 0 9px; font-size:12.5px; color:var(--plume); line-height:1.45}
.ra-f-ph{display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:8px}
.ra-f-ph.un{grid-template-columns:minmax(0,1fr)}
.ra-f-ph button{height:52px; border-radius:13px; border:1.5px solid var(--bleu-trait); background:var(--carte); color:var(--encre2);
  font-size:13.5px; font-weight:800; display:flex; align-items:center; justify-content:center; gap:8px}
.ra-f-ph button:disabled{opacity:.6}
.ra-f-vigs{display:grid; grid-template-columns:repeat(4,minmax(0,1fr)); gap:8px; margin-top:10px}
.ra-f-vig{position:relative; aspect-ratio:1; border-radius:12px; overflow:hidden; background:#E8EFF8}
.ra-f-vig img{width:100%; height:100%; object-fit:cover; display:block}
.ra-f-vig button{position:absolute; top:5px; right:5px; width:24px; height:24px; border-radius:50%; background:rgba(19,36,61,.72);
  color:#fff; display:flex; align-items:center; justify-content:center; padding:0}
.ra-f-vig.attente{background:linear-gradient(100deg,#E8EFF8 30%,#F5F8FC 50%,#E8EFF8 70%); background-size:300% 100%;
  animation:raAttente 1.2s linear infinite}
@keyframes raAttente{from{background-position:100% 0} to{background-position:0 0}}
.ra-f-aime{display:flex; flex-wrap:wrap; gap:7px}
.ra-f-aime button{height:38px; padding:0 13px; border-radius:99px; border:1.5px solid var(--trait); background:var(--carte);
  color:#3D4C63; font-size:13px; font-weight:700; -webkit-tap-highlight-color:transparent}
.ra-f-aime button.on{border-color:var(--marque); background:var(--marque); color:#fff}
.ra-f textarea{min-height:84px; resize:none; font-size:14.5px; line-height:1.5}
.ra-f-go{margin-top:18px}
.ra-f-go:disabled{opacity:.8}
.ra-f-err{margin-top:12px; color:#991b1b; background:var(--brique-fond); border:1px solid var(--brique-trait);
  border-radius:12px; padding:11px 13px; line-height:1.55; font-size:14px}
.ra-f-pied{margin:10px 0 0; font-size:12.5px; color:var(--plume); text-align:center; line-height:1.5}

/* — « Vos annonces envoyées » — */
.ra-page{display:flex; flex-direction:column; gap:14px}
.ra-autre{display:flex; align-items:center; justify-content:center; gap:8px; height:48px; border-radius:14px;
  border:1.5px dashed #F2C08A; background:#FFF8EF; color:var(--or-fonce); font-size:14px; font-weight:800}
.ra-liste{display:flex; flex-direction:column; gap:12px}
.ra-l{background:var(--carte); border:1px solid var(--trait); border-radius:18px; padding:14px; box-shadow:var(--ombre);
  display:flex; flex-direction:column; gap:10px}
.ra-l-h{display:flex; align-items:flex-start; gap:12px}
.ra-l-tx{display:flex; flex-direction:column; gap:3px; min-width:0}
.ra-l-tx b{font-size:15px; font-weight:800; line-height:1.3}
.ra-l-m{font-size:12.5px; color:var(--plume)}
.ra-rep{display:flex; flex-direction:column; gap:3px; padding:10px 13px; border-radius:12px; background:var(--fond);
  border-left:3px solid var(--plume-clair); font-size:14px; line-height:1.55; color:var(--encre)}
.ra-rep i{font-style:normal; font-size:11.5px; font-weight:800; color:var(--plume)}
.ra-rep.vide{color:var(--plume); font-size:13.5px}
.ra-rep.vert{background:var(--vert-fond); border-left-color:var(--vert)}
.ra-mot{display:flex; flex-direction:column; gap:2px; font-size:13px; color:var(--plume); line-height:1.5}
.ra-l-b{display:flex; gap:8px; flex-wrap:wrap}
.ra-voir-b, .ra-revoir{display:inline-flex; align-items:center; gap:4px; height:38px; padding:0 14px; border-radius:11px;
  font-size:13.5px; font-weight:800; text-decoration:none}
.ra-voir-b{background:var(--marque); color:#fff}
.ra-revoir{background:var(--fond); color:var(--encre2); border:1px solid var(--trait)}

/* — dans la fiche et la liste d'un bien né de son annonce — */
.ra-propose{display:flex; flex-direction:column; gap:6px; margin:-6px 0 14px; padding:11px 14px; border-radius:14px;
  background:var(--vert-fond); border:1px solid var(--vert-trait); font-size:14px; line-height:1.55; color:var(--encre)}
.ra-propose > b{display:flex; align-items:center; gap:7px; font-size:12px; font-weight:800; letter-spacing:.3px; color:var(--vert)}
.ra-propose > span i{font-style:normal; font-weight:700; color:var(--plume)}
.ra-pp{display:inline-flex; align-items:center; gap:5px; font-size:12px; font-weight:800; color:var(--vert); margin-top:4px}
`;
