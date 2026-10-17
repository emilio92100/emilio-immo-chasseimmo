'use client';
import { useMemo, useState } from 'react';

/* ═══ « Quelles sont vos disponibilités ? » (V3.209) ═══════════════════════
   Alexandre, après un client : « il y a marqué le mercredi, samedi matin,
   samedi après-midi : c'est pas très logique, il faudrait tous les autres
   jours » ; « choisir une date avec un beau calendrier, il indique l'horaire,
   14 h, 15 h…, ou une plage ». Canevas « Vos disponibilités pour visiter » :
   il a pris la planche A.

   Deux façons de répondre, qui s'ajoutent :
     · des moments en général, plusieurs à la fois (Dès que possible, En
       semaine en journée, En semaine le soir, Le week-end) ;
     · des dates précises : un calendrier, puis « Toute la journée », « À une
       heure » ou « Une plage » (« de 14 h à 17 h »), autant qu'il veut.
   Chaque choix est une phrase (« Jeu. 22 oct. de 14 h à 17 h ») : elles
   partent comme les anciennes pastilles, séparées par « · », et le CRM les
   relit telles quelles (Visites, le mail à Alexandre, la fiche).

   Sur un écran large (le conteneur, pas la fenêtre : @container), le
   calendrier reste ouvert à droite ; sur un téléphone, il s'ouvre au toucher
   de « Choisir une date ». */

export const MOMENTS_DISPO: { n: string; s: string; i: string }[] = [
  { n: 'Dès que possible', s: 'Le premier créneau qui se libère', i: 'eclair' },
  { n: 'En semaine, en journée', s: 'Du lundi au vendredi, avant 18 h', i: 'soleil' },
  { n: 'En semaine, le soir', s: 'Après 18 h', i: 'lune' },
  { n: 'Le week-end', s: 'Samedi ou dimanche', i: 'calendrier' },
];
/* Les pastilles d'avant la V3.209 : elles se relisent encore comme des pastilles. */
export const ANCIENS_DISPO: { n: string; i: string }[] = [
  { n: 'En semaine après 18 h', i: 'lune' },
  { n: 'Le mercredi', i: 'calendrier' },
  { n: 'Samedi matin', i: 'calendrier' },
  { n: 'Samedi après-midi', i: 'calendrier' },
];
/** Une date précise écrite par ce composant (« Jeu. 22 oct. … »). */
export const estDateDispo = (t: string) => /^(Lun|Mar|Mer|Jeu|Ven|Sam|Dim)\. \d{1,2} \S/.test(t);

const JOURS = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'];
const JC = ['Dim.', 'Lun.', 'Mar.', 'Mer.', 'Jeu.', 'Ven.', 'Sam.'];
const MOIS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
const MC = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];
const HEURES = [8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20];
const MOIS_MAX = 3;
const maj = (t: string) => t.charAt(0).toUpperCase() + t.slice(1);
const debutJour = (d: Date) => `${JC[d.getDay()]} ${d.getDate()} ${MC[d.getMonth()]}`;

type Mode = 'jour' | 'heure' | 'plage';

/* Les dessins : un trait, la couleur du texte. */
const D: Record<string, string> = {
  eclair: 'M13 2 4 14h7l-1 8 9-12h-7l1-8z',
  soleil: 'M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8zM12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4',
  lune: 'M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z',
  calendrier: 'M5 5h14a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2zM3 10h18M8 3v4M16 3v4',
  croix: 'M6 6l12 12M18 6 6 18',
  plus: 'M12 5v14M5 12h14',
  gauche: 'm15 18-6-6 6-6',
  droite: 'm9 18 6-6-6-6',
};
function Svg({ n, t = 17, e = 2 }: { n: string; t?: number; e?: number }) {
  return (
    <svg width={t} height={t} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={e} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={D[n] || D.calendrier} />
    </svg>
  );
}

export default function ChoixDispos({ choisies, onBasculer }: {
  choisies: string[];
  /** Ajoute la phrase si elle n'y est pas, l'enlève sinon. */
  onBasculer: (n: string) => void;
}) {
  const auj = useMemo(() => { const d = new Date(); d.setHours(0, 0, 0, 0); return d; }, []);
  const [cal, setCal] = useState(false);
  const [decale, setDecale] = useState(0);
  const [jour, setJour] = useState<Date | null>(null);
  const [mode, setMode] = useState<Mode>('plage');
  const [h1, setH1] = useState<number | null>(null);
  const [h2, setH2] = useState<number | null>(null);

  const dates = choisies.filter(estDateDispo);
  const premier = new Date(auj.getFullYear(), auj.getMonth() + decale, 1);
  const vides = (premier.getDay() + 6) % 7;
  const nb = new Date(premier.getFullYear(), premier.getMonth() + 1, 0).getDate();

  const choisirMode = (m: Mode) => { setMode(m); setH1(null); setH2(null); };
  const toucherHeure = (h: number) => {
    if (mode === 'heure') { setH1(h); return; }
    if (h1 == null || h2 != null) { setH1(h); setH2(null); }
    else if (h > h1) setH2(h);
    else setH1(h);
  };
  const pret = !!jour && (mode === 'jour' || (mode === 'heure' && h1 != null) || (mode === 'plage' && h1 != null && h2 != null));
  const phrase = !jour ? '' : mode === 'jour' ? `${debutJour(jour)}, toute la journée`
    : mode === 'heure' ? `${debutJour(jour)} à ${h1} h`
    : `${debutJour(jour)} de ${h1} h à ${h2} h`;
  const ajouter = () => {
    if (!pret) return;
    if (!choisies.includes(phrase)) onBasculer(phrase);
    setJour(null); setH1(null); setH2(null); setCal(false);
  };
  const aideHeure = mode === 'heure' ? 'À quelle heure ?'
    : h1 == null ? 'Touchez l’heure de début, puis celle de fin.'
    : h2 == null ? `De ${h1} h… et jusqu’à quelle heure ?`
    : `De ${h1} h à ${h2} h.`;

  return (
    <div className="cdp" data-cal={cal ? 'oui' : 'non'}>
      <style>{CSS_DISPOS}</style>
      <div className="cdp-cols">
        <div className="cdp-gauche">
          <section className="cdp-sec">
            <span className="cdp-l">En général</span>
            <div className="cdp-g">
              {MOMENTS_DISPO.map(x => (
                <button key={x.n} type="button" className="cdp-c" aria-pressed={choisies.includes(x.n)} onClick={() => onBasculer(x.n)}>
                  <i className="cdp-ic"><Svg n={x.i} /></i>
                  <span><b>{x.n}</b><small>{x.s}</small></span>
                </button>
              ))}
            </div>
          </section>
          <section className="cdp-sec">
            <span className="cdp-l">Des dates précises</span>
            {dates.map(d => (
              <div key={d} className="cdp-d">
                <i className="cdp-ic on"><Svg n="calendrier" t={15} e={2.2} /></i>
                <b>{d}</b>
                <button type="button" className="cdp-x" aria-label={`Retirer ${d}`} onClick={() => onBasculer(d)}><Svg n="croix" t={16} e={2.2} /></button>
              </div>
            ))}
            <button type="button" className="cdp-ouvrir" onClick={() => setCal(true)}>
              <Svg n="plus" t={17} e={2.2} /><span>{dates.length ? 'Ajouter une autre date' : 'Choisir une date'}</span>
            </button>
            {!dates.length && <span className="cdp-aide">Touchez un jour dans le calendrier, puis l’heure ou la plage qui vous arrange.</span>}
          </section>
        </div>

        <div className="cdp-cal">
          <div className="cdp-mois">
            <button type="button" className="cdp-fl" aria-label="Mois précédent" disabled={decale <= 0} onClick={() => setDecale(x => Math.max(0, x - 1))}><Svg n="gauche" t={18} e={2.2} /></button>
            <b>{`${maj(MOIS[premier.getMonth()])} ${premier.getFullYear()}`}</b>
            <button type="button" className="cdp-fl" aria-label="Mois suivant" disabled={decale >= MOIS_MAX} onClick={() => setDecale(x => Math.min(MOIS_MAX, x + 1))}><Svg n="droite" t={18} e={2.2} /></button>
          </div>
          <div className="cdp-sem" aria-hidden="true"><span>L</span><span>M</span><span>M</span><span>J</span><span>V</span><span>S</span><span>D</span></div>
          <div className="cdp-jours">
            {Array.from({ length: vides }, (_, i) => <span key={`v${i}`} />)}
            {Array.from({ length: nb }, (_, i) => {
              const d = new Date(premier.getFullYear(), premier.getMonth(), i + 1);
              const passe = d < auj;
              const estAuj = d.getTime() === auj.getTime();
              const sel = !!jour && d.getTime() === jour.getTime();
              const pris = dates.some(t => t.startsWith(debutJour(d) + ' ') || t.startsWith(debutJour(d) + ','));
              return (
                <button key={i} type="button" className="cdp-j" disabled={passe} aria-pressed={sel}
                  data-auj={estAuj ? '' : undefined} data-pris={pris ? '' : undefined}
                  aria-label={`${maj(JOURS[d.getDay()])} ${d.getDate()} ${MOIS[d.getMonth()]}${estAuj ? ', aujourd’hui' : ''}`}
                  onClick={() => { setJour(d); setH1(null); setH2(null); }}>{d.getDate()}</button>
              );
            })}
          </div>

          {jour && (
            <div className="cdp-quand">
              <b>{`${maj(JOURS[jour.getDay()])} ${jour.getDate()} ${MOIS[jour.getMonth()]}`}</b>
              <div className="cdp-modes" role="group" aria-label="Quand, ce jour-là">
                <button type="button" aria-pressed={mode === 'jour'} onClick={() => choisirMode('jour')}>Toute la journée</button>
                <button type="button" aria-pressed={mode === 'heure'} onClick={() => choisirMode('heure')}>À une heure</button>
                <button type="button" aria-pressed={mode === 'plage'} onClick={() => choisirMode('plage')}>Une plage</button>
              </div>
              {mode !== 'jour' && (
                <>
                  <span className="cdp-aideh">{aideHeure}</span>
                  <div className="cdp-h">
                    {HEURES.map(h => {
                      const bout = h === h1 || (mode === 'plage' && h === h2);
                      const dans = mode === 'plage' && h1 != null && h2 != null && h > h1 && h < h2;
                      return (
                        <button key={h} type="button" aria-pressed={bout} data-dans={dans ? '' : undefined} onClick={() => toucherHeure(h)}>{`${h} h`}</button>
                      );
                    })}
                  </div>
                </>
              )}
              <button type="button" className="cdp-ajout" disabled={!pret} onClick={ajouter}>{pret ? `Ajouter « ${phrase} »` : 'Ajouter ce créneau'}</button>
            </div>
          )}
          <button type="button" className="cdp-fermer" onClick={() => { setCal(false); setJour(null); setH1(null); setH2(null); }}>Fermer le calendrier</button>
        </div>
      </div>

      <div className="cdp-res">
        <span>Votre conseiller recevra</span>
        <p>{choisies.length ? choisies.join(' · ') : 'Rien pour l’instant : choisissez un moment ou une date.'}</p>
      </div>
    </div>
  );
}

export const CSS_DISPOS = `
.cdp{container-type:inline-size; display:flex; flex-direction:column; gap:16px; color:#13243D; text-align:left}
.cdp-cols{display:flex; flex-direction:column; gap:16px}
.cdp-gauche{display:flex; flex-direction:column; gap:18px; min-width:0}
.cdp-sec{display:flex; flex-direction:column; gap:10px}
.cdp-l{font-size:11.5px; font-weight:800; letter-spacing:1.2px; color:#A95808; text-transform:uppercase}
.cdp-g{display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:8px}
.cdp-c{display:flex; align-items:flex-start; gap:10px; min-height:68px; padding:12px 10px; border-radius:16px;
  border:1px solid #DCE3EC; background:#fff; color:#13243D; text-align:left; font:inherit; cursor:pointer; box-sizing:border-box}
.cdp-c[aria-pressed="true"]{border-color:#22497D; box-shadow:inset 0 0 0 .5px #22497D; background:#EEF3FA}
.cdp-c > span{display:flex; flex-direction:column; gap:2px; min-width:0}
.cdp-c b{font-size:14px; line-height:1.25; font-weight:700}
.cdp-c small{font-size:12.5px; line-height:1.35; color:#5B6B80}
.cdp-ic{width:32px; height:32px; border-radius:10px; flex-shrink:0; display:inline-flex; align-items:center; justify-content:center;
  background:#F5F8FC; color:#22497D; font-style:normal}
.cdp-c[aria-pressed="true"] .cdp-ic, .cdp-ic.on{background:#22497D; color:#fff}
.cdp-d{display:flex; align-items:center; gap:10px; padding:6px 4px 6px 10px; border-radius:14px; background:#EEF3FA; border:1.5px solid #22497D}
.cdp-d .cdp-ic{width:30px; height:30px; border-radius:9px}
.cdp-d b{flex:1 1 auto; min-width:0; font-size:14px; font-weight:700}
.cdp-x{width:40px; height:40px; flex-shrink:0; border:none; background:transparent; color:#5B6B80; border-radius:10px;
  display:inline-flex; align-items:center; justify-content:center; cursor:pointer}
.cdp-ouvrir{display:flex; align-items:center; justify-content:center; gap:8px; min-height:48px; border-radius:14px;
  border:1.5px dashed #9FB3CC; background:#fff; color:#22497D; font:inherit; font-size:14.5px; font-weight:700; cursor:pointer}
.cdp[data-cal="oui"] .cdp-ouvrir{display:none}
.cdp-aide{display:none; font-size:13px; color:#5B6B80; line-height:1.45}
.cdp-cal{display:flex; flex-direction:column; gap:12px; padding:14px; border-radius:18px; border:1px solid #DCE3EC; background:#fff; min-width:0}
.cdp[data-cal="non"] .cdp-cal{display:none}
.cdp-mois{display:flex; align-items:center; gap:6px}
.cdp-mois b{flex:1 1 auto; text-align:center; font-size:15.5px; font-weight:800}
.cdp-fl{width:40px; height:40px; flex-shrink:0; border-radius:12px; border:1px solid #DCE3EC; background:#fff; color:#13243D;
  display:inline-flex; align-items:center; justify-content:center; cursor:pointer; padding:0}
.cdp-fl:disabled{color:#C3CCD8; cursor:default}
.cdp-sem, .cdp-jours{display:grid; grid-template-columns:repeat(7,minmax(0,1fr)); gap:4px}
.cdp-sem span{text-align:center; font-size:11.5px; font-weight:800; color:#5B6B80}
.cdp-j{position:relative; height:42px; border-radius:12px; border:none; background:#F5F8FC; color:#13243D; font:inherit;
  font-size:14.5px; font-weight:700; cursor:pointer; padding:0}
.cdp-j:disabled{background:transparent; color:#B4BFCD; cursor:default}
.cdp-j[data-auj]{background:#fff; box-shadow:inset 0 0 0 1.5px #E68B23}
.cdp-j[aria-pressed="true"]{background:#13243D; color:#fff; box-shadow:none}
.cdp-j[data-pris]::after{content:''; position:absolute; left:50%; bottom:5px; width:5px; height:5px; margin-left:-2.5px; border-radius:50%; background:#E68B23}
.cdp-j[aria-pressed="true"][data-pris]::after{background:#F2B266}
.cdp-quand{display:flex; flex-direction:column; gap:12px; padding-top:12px; border-top:1px solid #E8EDF3}
.cdp-quand > b{font-size:15px; font-weight:800}
.cdp-modes{display:grid; grid-template-columns:repeat(3,minmax(0,1fr)); gap:4px; padding:4px; border-radius:13px; background:#F5F8FC}
.cdp-modes button{min-height:40px; padding:0 4px; border-radius:10px; border:none; background:transparent; color:#5B6B80;
  font:inherit; font-size:13px; font-weight:700; cursor:pointer}
.cdp-modes button[aria-pressed="true"]{background:#fff; color:#13243D; box-shadow:0 1px 3px rgba(19,36,61,.18)}
.cdp-aideh{font-size:13px; color:#5B6B80}
.cdp-h{display:grid; grid-template-columns:repeat(5,minmax(0,1fr)); gap:6px}
.cdp-h button{min-height:42px; border-radius:11px; border:1px solid #DCE3EC; background:#fff; color:#13243D; font:inherit;
  font-size:13.5px; font-weight:700; cursor:pointer; padding:0}
.cdp-h button[data-dans]{background:#D6E2F2; border-color:#D6E2F2}
.cdp-h button[aria-pressed="true"]{background:#13243D; border-color:#13243D; color:#fff}
.cdp-ajout{min-height:48px; border-radius:14px; border:none; background:#22497D; color:#fff; font:inherit; font-size:14.5px;
  font-weight:800; cursor:pointer; padding:6px 12px; line-height:1.3}
.cdp-ajout:disabled{background:#E8EDF3; color:#8A97AA; cursor:default}
.cdp-fermer{min-height:40px; border:none; background:transparent; color:#5B6B80; font:inherit; font-size:13.5px; font-weight:700; cursor:pointer}
.cdp-res{display:flex; flex-direction:column; gap:4px; padding:12px 14px; border-radius:14px; background:#F5F8FC}
.cdp-res span{font-size:12px; font-weight:800; letter-spacing:.4px; color:#5B6B80; text-transform:uppercase}
.cdp-res p{margin:0; font-size:14px; line-height:1.5; color:#13243D}
/* Une colonne étroite (la fiche d'un bien, au téléphone) : les moments l'un sous l'autre. */
@container (max-width: 340px){
  .cdp-g{grid-template-columns:minmax(0,1fr)}
  .cdp-c{min-height:56px; align-items:center}
  .cdp-cal{padding:10px}
  .cdp-sem, .cdp-jours{gap:3px}
  .cdp-j{height:38px; font-size:14px; border-radius:10px}
  .cdp-h{grid-template-columns:repeat(4,minmax(0,1fr))}
  .cdp-modes button{font-size:12.5px}
}
@container (min-width: 700px){
  .cdp-cols{display:grid; grid-template-columns:minmax(0,1fr) minmax(0,1fr); gap:28px; align-items:start}
  .cdp[data-cal] .cdp-cal{display:flex}
  .cdp[data-cal] .cdp-ouvrir, .cdp-fermer{display:none}
  .cdp-aide{display:block}
}
`;
