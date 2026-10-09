'use client';
import { useEffect, useRef, useState, type ReactNode } from 'react';

/* ═══ Le lieu de naissance et l'adresse, accompagnés (V3.153) ════════════
   Alexandre : « la personne a un peu galéré pour la ville de naissance…
   qu'il y ait une présélection qui les accompagne s'ils mettent un début
   d'adresse, de ville, ou un code postal ; et si elle est née à l'étranger,
   une petite coche : un nouveau champ s'active, la ville et le pays ».

   Utilisé par le mandat (SignatureMandat : le mandant et son co-acquéreur)
   et par la page du co-signataire (SignatureCosignataire).
     · Lieu de naissance : les communes de France à mesure qu'on tape (« Clam »
       → « Clamart (Hauts-de-Seine) »), arrondissements compris ; « Né à
       l'étranger » remplace la case par « Ville » et « Pays ».
     · Adresse : les adresses officielles (la même base que « Nouveau contact »
       dans le CRM) dès le numéro et le début de la rue ; un code postal propose
       ses communes, une ville ses codes postaux. « J'habite à l'étranger » :
       rue, code postal, ville et pays, libres.
   Rien n'est imposé : sans réseau, ou pour un lieu que la base ne connaît pas,
   on tape librement, comme avant. Le mandat garde ses deux textes d'une ligne
   (`naissanceLieu`, `adresse`) : rien ne change côté serveur ni dans le PDF. */

/* ── Les pays, pour la liste du champ « Pays » (on peut taper autre chose) ── */
const PAYS = ('Afghanistan|Afrique du Sud|Albanie|Algérie|Allemagne|Andorre|Angola|Arabie saoudite|Argentine|Arménie|Australie|Autriche|'
  + 'Azerbaïdjan|Bahreïn|Bangladesh|Belgique|Bénin|Biélorussie|Birmanie|Bolivie|Bosnie-Herzégovine|Brésil|Bulgarie|Burkina Faso|Burundi|'
  + 'Cambodge|Cameroun|Canada|Cap-Vert|Centrafrique|Chili|Chine|Chypre|Colombie|Comores|Congo|Corée du Sud|Costa Rica|Côte d’Ivoire|Croatie|'
  + 'Cuba|Danemark|Djibouti|Égypte|Émirats arabes unis|Équateur|Espagne|Estonie|États-Unis|Éthiopie|Finlande|Gabon|Géorgie|Ghana|Grèce|'
  + 'Guatemala|Guinée|Guinée équatoriale|Haïti|Hongrie|Inde|Indonésie|Irak|Iran|Irlande|Islande|Israël|Italie|Jamaïque|Japon|Jordanie|'
  + 'Kazakhstan|Kenya|Koweït|Laos|Lettonie|Liban|Libye|Liechtenstein|Lituanie|Luxembourg|Macédoine du Nord|Madagascar|Malaisie|Mali|Malte|'
  + 'Maroc|Maurice|Mauritanie|Mexique|Moldavie|Monaco|Mongolie|Monténégro|Mozambique|Népal|Nicaragua|Niger|Nigeria|Norvège|'
  + 'Nouvelle-Zélande|Oman|Ouganda|Ouzbékistan|Pakistan|Panama|Paraguay|Pays-Bas|Pérou|Philippines|Pologne|Portugal|Qatar|'
  + 'République démocratique du Congo|République dominicaine|République tchèque|Roumanie|Royaume-Uni|Russie|Rwanda|Salvador|Sénégal|'
  + 'Serbie|Singapour|Slovaquie|Slovénie|Somalie|Soudan|Sri Lanka|Suède|Suisse|Syrie|Taïwan|Tanzanie|Tchad|Thaïlande|Togo|Tunisie|'
  + 'Turquie|Ukraine|Uruguay|Venezuela|Vietnam|Yémen|Zambie|Zimbabwe').split('|');
const ID_PAYS = 'mdt-liste-pays';
const sansAccent = (t: string) => t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
const PAYS_CLES = new Set(PAYS.map(sansAccent));
const estPays = (t: string) => PAYS_CLES.has(sansAccent(t));

/* ── Les bases publiques (sans clé, appelées depuis le navigateur) ── */
type Suggestion = { cle: string; titre: string; sous?: string; v: Record<string, string> };

type CommuneApi = { nom: string; codesPostaux?: string[]; departement?: { nom: string } };
const URL_COMMUNES = 'https://geo.api.gouv.fr/communes';

/* « Paris 15e Arrondissement » → « Paris 15e arrondissement » ; le département
   entre parenthèses, sauf quand il porte le nom de la ville (Paris). */
function nomNaissance(c: CommuneApi): string {
  const nom = c.nom.replace(/ Arrondissement$/, ' arrondissement');
  const dep = c.departement?.nom || '';
  return dep && !nom.startsWith(dep) ? `${nom} (${dep})` : nom;
}

async function communes(q: string, signal: AbortSignal, avecArrondissements: boolean): Promise<CommuneApi[]> {
  const t = q.trim();
  const cp = /^\d{5}$/.test(t);
  if (!cp && t.length < 2) return [];
  const p = new URLSearchParams({ fields: 'nom,codesPostaux,departement', format: 'json' });
  if (cp) p.set('codePostal', t);
  else { p.set('nom', t); p.set('boost', 'population'); p.set('limit', '7'); }
  if (avecArrondissements) p.set('type', 'arrondissement-municipal,commune-actuelle');
  const r = await fetch(`${URL_COMMUNES}?${p}`, { signal });
  if (!r.ok) return [];
  const j = await r.json().catch(() => []);
  return Array.isArray(j) ? (j as CommuneApi[]).slice(0, 7) : [];
}

type AdresseApi = { properties?: { name?: string; postcode?: string; city?: string; type?: string; label?: string } };
async function adresses(q: string, signal: AbortSignal): Promise<Suggestion[]> {
  const t = q.trim();
  if (t.length < 3 || !/^[\p{L}\p{N}]/u.test(t)) return [];
  const r = await fetch(`https://data.geopf.fr/geocodage/search?q=${encodeURIComponent(t.slice(0, 180))}&limit=6&autocomplete=1`, { signal });
  if (!r.ok) return [];
  const j = await r.json().catch(() => null) as { features?: AdresseApi[] } | null;
  const vus = new Set<string>();
  const l: Suggestion[] = [];
  for (const f of j?.features || []) {
    const p = f.properties || {};
    if (!p.postcode || !p.city) continue;
    const commune = p.type === 'municipality';
    const rue = commune ? '' : String(p.name || '');
    const cle = `${rue}|${p.postcode}|${p.city}`;
    if (vus.has(cle)) continue;
    vus.add(cle);
    l.push({ cle, titre: rue || p.city, sous: rue ? `${p.postcode} ${p.city}` : p.postcode, v: { rue, cp: p.postcode, ville: p.city } });
  }
  return l;
}

/* ── Une case qui propose en dessous ce qui correspond à la frappe ── */
function ChampSuggere({ lib, val, onChange, err, placeholder, auto, mode, chercher, onChoix, attente = 220, seulChoisi = false }: {
  lib: string; val: string; onChange: (v: string) => void; err?: string; placeholder?: string; auto?: string;
  mode?: 'text' | 'numeric'; chercher: (q: string, signal: AbortSignal) => Promise<Suggestion[]>;
  onChoix: (s: Suggestion) => void; attente?: number;
  /* Une seule réponse (un code postal d'une seule commune) : prise d'office. */
  seulChoisi?: boolean;
}) {
  const [liste, setListe] = useState<Suggestion[]>([]);
  const [ouvert, setOuvert] = useState(false);
  const [actif, setActif] = useState(-1);
  const minuteur = useRef<number | undefined>(undefined);
  const enCours = useRef<AbortController | null>(null);
  /* Un choix vient d'être fait : la frappe qu'il provoque ne relance pas de recherche. */
  const choisi = useRef(false);

  useEffect(() => () => { window.clearTimeout(minuteur.current); enCours.current?.abort(); }, []);

  const lancer = (q: string) => {
    window.clearTimeout(minuteur.current);
    enCours.current?.abort();
    minuteur.current = window.setTimeout(async () => {
      const a = new AbortController();
      enCours.current = a;
      try {
        const l = await chercher(q, a.signal);
        if (a.signal.aborted) return;
        if (seulChoisi && l.length === 1) { choisir(l[0]); return; }
        setListe(l); setActif(-1); setOuvert(l.length > 0);
      } catch { /* hors ligne, base indisponible : on tape librement */ }
    }, attente);
  };
  const taper = (v: string) => {
    onChange(v);
    if (choisi.current) { choisi.current = false; return; }
    lancer(v);
  };
  const choisir = (s: Suggestion) => {
    choisi.current = true;
    window.clearTimeout(minuteur.current); enCours.current?.abort();
    setOuvert(false); setListe([]); setActif(-1);
    onChoix(s);
    choisi.current = false;
  };
  const clavier = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!ouvert || !liste.length) return;
    if (e.key === 'ArrowDown') { e.preventDefault(); setActif(i => (i + 1) % liste.length); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActif(i => (i <= 0 ? liste.length - 1 : i - 1)); }
    else if (e.key === 'Enter' && actif >= 0) { e.preventDefault(); choisir(liste[actif]); }
    else if (e.key === 'Escape') setOuvert(false);
  };

  return (
    <label className={'mdt-ch mdt-sug-ch' + (err ? ' err' : '')}>
      <span className="l">{lib}</span>
      <input type="text" value={val} onChange={e => taper(e.target.value)} onKeyDown={clavier} inputMode={mode}
        onFocus={() => { if (liste.length) setOuvert(true); }}
        onBlur={() => window.setTimeout(() => setOuvert(false), 160)}
        autoComplete={auto || 'off'} placeholder={placeholder}
        role="combobox" aria-expanded={ouvert} aria-autocomplete="list" />
      {ouvert && liste.length > 0 && (
        <ul className="mdt-sug" role="listbox">
          {liste.map((s, i) => (
            <li key={s.cle} role="option" aria-selected={i === actif} data-on={i === actif ? '1' : undefined}
              onMouseDown={e => e.preventDefault()} onClick={() => choisir(s)}>
              <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M12 21s-6.5-5.6-6.5-11a6.5 6.5 0 0 1 13 0c0 5.4-6.5 11-6.5 11z" /><circle cx="12" cy="10" r="2.3" />
              </svg>
              <span className="t"><b>{s.titre}</b>{s.sous && <small>{s.sous}</small>}</span>
            </li>
          ))}
        </ul>
      )}
      {err && <span className="e">{err}</span>}
    </label>
  );
}

/* Une case simple, avec une liste facultative (les pays). */
function ChampLibre({ lib, val, onChange, err, placeholder, auto, liste }: {
  lib: string; val: string; onChange: (v: string) => void; err?: string; placeholder?: string; auto?: string; liste?: string;
}) {
  return (
    <label className={'mdt-ch' + (err ? ' err' : '')}>
      <span className="l">{lib}</span>
      <input type="text" value={val} onChange={e => onChange(e.target.value)} autoComplete={auto || 'off'} placeholder={placeholder} list={liste} />
      {err && <span className="e">{err}</span>}
    </label>
  );
}

function ListePays() {
  return <datalist id={ID_PAYS}>{PAYS.map(p => <option key={p} value={p} />)}</datalist>;
}

/* La petite coche sous les cases. */
function Coche({ on, onClick, children }: { on: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button type="button" className="mdt-mini" data-on={on ? '1' : undefined} onClick={onClick} aria-pressed={on}>
      <span className="bx">
        {on && <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M5 12.5l4.2 4.2L19 7" /></svg>}
      </span>
      <span>{children}</span>
    </button>
  );
}

/* ═══ Le lieu de naissance ═══ */

/* « Casablanca (Maroc) » : né à l'étranger. Le pays doit être un pays connu,
   pas un département (« Clamart (Hauts-de-Seine) »). */
function lireNaissance(v: string): { etranger: boolean; ville: string; pays: string } {
  const d = /^(.*\S)\s*\(([^()]+)\)\s*$/.exec(v || '');
  if (d && estPays(d[2]) && sansAccent(d[2]) !== 'france') return { etranger: true, ville: d[1].trim(), pays: d[2].trim() };
  return { etranger: false, ville: v || '', pays: '' };
}
const ecrireNaissance = (ville: string, pays: string) => {
  const v = ville.trim(), p = pays.trim();
  return v && p ? `${v} (${p})` : v || p;
};

/** La date (passée par l'appelant) et le lieu de naissance, côte à côte. */
export function BlocNaissance({ date, val, onChange, err, civilite }: {
  date: ReactNode; val: string; onChange: (v: string) => void; err?: string; civilite: string;
}) {
  const [etat, setEtat] = useState(() => lireNaissance(val));
  const ne = civilite === 'Madame' ? 'Née' : civilite === 'Monsieur' ? 'Né' : 'Né(e)';
  const basculer = () => {
    const x = { etranger: !etat.etranger, ville: '', pays: '' };
    setEtat(x); onChange('');
  };
  const majEtr = (k: 'ville' | 'pays') => (v: string) => {
    const x = { ...etat, [k]: v };
    setEtat(x); onChange(ecrireNaissance(x.ville, x.pays));
  };
  return (
    <div className="mdt-bloc">
      <div className="mdt-deux">
        {date}
        {etat.etranger
          ? <ChampLibre lib="Ville de naissance" val={etat.ville} onChange={majEtr('ville')} err={err && !etat.ville.trim() ? err : undefined} placeholder="Ex. : Casablanca" />
          : (
            <ChampSuggere lib="Lieu de naissance" val={val} err={err} placeholder="Commencez à taper la ville"
              onChange={v => { setEtat({ etranger: false, ville: v, pays: '' }); onChange(v); }}
              chercher={async (q, signal) => (await communes(q, signal, true)).map(c => {
                const n = nomNaissance(c);
                return { cle: n, titre: c.nom.replace(/ Arrondissement$/, ' arrondissement'), sous: c.departement?.nom, v: { lieu: n } };
              })}
              onChoix={s => { setEtat({ etranger: false, ville: s.v.lieu, pays: '' }); onChange(s.v.lieu); }} />
          )}
      </div>
      {etat.etranger && (
        <>
          <ChampLibre lib="Pays de naissance" val={etat.pays} onChange={majEtr('pays')} err={err && etat.ville.trim() && !etat.pays.trim() ? 'Le pays' : undefined}
            placeholder="Ex. : Maroc" liste={ID_PAYS} />
          <ListePays />
        </>
      )}
      <Coche on={etat.etranger} onClick={basculer}>{`${ne} à l’étranger`}</Coche>
    </div>
  );
}

/* ═══ L'adresse ═══ */

/** En France : rue, code postal, ville. À l'étranger, `pays` existe (même vide). */
export type AdresseSaisie = { rue: string; cp: string; ville: string; pays?: string };

export function BlocAdresse({ adr, onAdr, champs, tiers = false, autoNav = true, libRue = 'Adresse' }: {
  adr: AdresseSaisie; onAdr: (x: AdresseSaisie) => void; champs: Record<string, string | undefined>;
  /* Saisie pour quelqu'un d'autre (« Habite à l'étranger ») ; sans remplissage du navigateur. */
  tiers?: boolean; autoNav?: boolean; libRue?: string;
}) {
  const etranger = adr.pays !== undefined;
  const maj = (k: keyof AdresseSaisie) => (v: string) => onAdr({ ...adr, [k]: k === 'cp' ? v.replace(/[^0-9A-Za-z -]/g, '').slice(0, 10) : v });
  const auto = (a: string) => (autoNav && !tiers ? a : 'off');
  const errRue = champs.rue || champs.adresse;

  if (etranger) {
    return (
      <div className="mdt-bloc">
        <ChampLibre lib={libRue} val={adr.rue} onChange={maj('rue')} err={errRue} placeholder="Numéro et rue" auto={auto('address-line1')} />
        <div className="mdt-cpv">
          <ChampLibre lib="Code postal" val={adr.cp} onChange={maj('cp')} err={champs.cp} auto={auto('postal-code')} />
          <ChampLibre lib="Ville" val={adr.ville} onChange={maj('ville')} err={champs.ville} auto={auto('address-level2')} />
        </div>
        <ChampLibre lib="Pays" val={adr.pays || ''} onChange={maj('pays')} err={champs.pays} placeholder="Ex. : Belgique" liste={ID_PAYS} auto={auto('country-name')} />
        <ListePays />
        <Coche on onClick={() => onAdr({ rue: '', cp: '', ville: '' })}>{tiers ? 'Habite à l’étranger' : 'J’habite à l’étranger'}</Coche>
      </div>
    );
  }
  return (
    <div className="mdt-bloc">
      <ChampSuggere lib={libRue} val={adr.rue} onChange={maj('rue')} err={errRue} placeholder="Numéro et rue — ex. : 18 avenue Victor Hugo"
        auto={auto('address-line1')} chercher={adresses}
        onChoix={s => onAdr({ rue: s.v.rue, cp: s.v.cp, ville: s.v.ville })} />
      <div className="mdt-cpv">
        <ChampSuggere lib="Code postal" val={adr.cp} onChange={maj('cp')} err={champs.cp} mode="numeric" auto={auto('postal-code')} attente={120} seulChoisi
          chercher={async (q, signal) => (/^\d{5}$/.test(q.trim()) ? (await communes(q, signal, false)).map(c => ({ cle: c.nom, titre: c.nom, sous: q.trim(), v: { cp: q.trim(), ville: c.nom } })) : [])}
          onChoix={s => onAdr({ ...adr, cp: s.v.cp, ville: s.v.ville })} />
        <ChampSuggere lib="Ville" val={adr.ville} onChange={maj('ville')} err={champs.ville} auto={auto('address-level2')}
          chercher={async (q, signal) => {
            if (/^\d/.test(q.trim())) return [];
            const l: Suggestion[] = [];
            for (const c of await communes(q, signal, false)) {
              for (const cp of (c.codesPostaux || []).slice(0, 3)) l.push({ cle: `${c.nom}|${cp}`, titre: c.nom, sous: cp, v: { cp, ville: c.nom } });
            }
            return l.slice(0, 7);
          }}
          onChoix={s => onAdr({ ...adr, cp: s.v.cp, ville: s.v.ville })} />
      </div>
      <Coche on={false} onClick={() => onAdr({ rue: '', cp: '', ville: '', pays: '' })}>{tiers ? 'Habite à l’étranger' : 'J’habite à l’étranger'}</Coche>
    </div>
  );
}

/* « 18 avenue Victor Hugo, 92100 Boulogne-Billancourt » ; à l'étranger, le pays
   en dernier : « 12 rue Royale, 1000 Bruxelles, Belgique ». */
export function joindreAdresseSaisie(x: AdresseSaisie): string {
  const ligne = [x.rue.trim(), [x.cp.trim(), x.ville.trim()].filter(Boolean).join(' ')].filter(Boolean).join(', ');
  return x.pays !== undefined && x.pays.trim() ? [ligne, x.pays.trim()].filter(Boolean).join(', ') : ligne;
}
export function couperAdresseSaisie(a: string): AdresseSaisie {
  const t = (a || '').trim();
  const parts = t.split(/\s*,\s*/);
  const dernier = parts.length > 1 ? parts[parts.length - 1] : '';
  if (dernier && estPays(dernier) && sansAccent(dernier) !== 'france') {
    const reste = parts.slice(0, -1);
    const lieu = reste.length > 1 ? reste[reste.length - 1] : '';
    const m = /^(\S*\d\S*)\s+(.+)$/.exec(lieu);
    return {
      rue: (lieu ? reste.slice(0, -1) : reste).join(', '),
      cp: m ? m[1] : '', ville: m ? m[2] : lieu, pays: dernier,
    };
  }
  const d = /^(.*?)[,\s]+(\d{5})\s+(.+)$/.exec(t);
  return d ? { rue: d[1].trim(), cp: d[2], ville: d[3].trim() } : { rue: t, cp: '', ville: '' };
}

/** Les cases de l'adresse à revoir avant d'envoyer le code. */
export function manquesAdresse(adr: AdresseSaisie): Record<string, string> {
  const m: Record<string, string> = {};
  if (adr.rue.trim().length < 3) m.rue = 'Numéro et rue';
  if (adr.pays !== undefined) {
    if (adr.ville.trim().length < 2) m.ville = 'Ville';
    if (adr.pays.trim().length < 2) m.pays = 'Pays';
  } else {
    if (!/^[0-9A-Za-z -]{4,10}$/.test(adr.cp.trim())) m.cp = 'Code postal';
    if (adr.ville.trim().length < 2) m.ville = 'Ville';
  }
  return m;
}

/* Les styles, ajoutés à ceux du mandat (CSS_MANDAT). */
export const CSS_LIEU = `
.mdt-bloc{display:flex; flex-direction:column; gap:10px; min-width:0}
.mdt-sug-ch{position:relative}
.mdt-sug{position:absolute; z-index:30; top:100%; left:0; right:0; margin:6px 0 0; padding:5px; list-style:none;
  background:#fff; border:1px solid var(--trait); border-radius:14px; box-shadow:0 18px 40px -18px rgba(19,36,61,.45);
  max-height:280px; overflow:auto; animation:mdtSug .16s ease both}
@keyframes mdtSug{from{opacity:0; transform:translateY(-4px)}}
.mdt-sug li{display:flex; align-items:center; gap:10px; padding:9px 10px; border-radius:10px; cursor:pointer; color:var(--plume)}
.mdt-sug li[data-on], .mdt-sug li:hover{background:var(--fond)}
.mdt-sug li .t{display:flex; flex-direction:column; min-width:0}
.mdt-sug li b{font-size:14px; font-weight:700; color:var(--encre); overflow:hidden; text-overflow:ellipsis; white-space:nowrap}
.mdt-sug li small{font-size:12px; color:var(--plume)}
.mdt-mini{align-self:flex-start; display:inline-flex; align-items:center; gap:8px; padding:4px 2px; border:none; background:none;
  font:inherit; font-size:13px; font-weight:600; color:var(--plume); cursor:pointer}
.mdt-mini .bx{flex:0 0 auto; width:19px; height:19px; border-radius:6px; border:1.6px solid var(--trait-fort); background:#fff;
  display:inline-flex; align-items:center; justify-content:center; color:#fff}
.mdt-mini[data-on]{color:var(--encre)}
.mdt-mini[data-on] .bx{background:var(--or); border-color:var(--or)}
@media (prefers-reduced-motion: reduce){ .mdt-sug{animation:none} }
`;
