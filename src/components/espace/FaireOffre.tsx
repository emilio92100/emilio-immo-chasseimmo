'use client';
/* ═══ « Faire une offre », depuis l'espace du client (V3.189) ═══════════════

   Alexandre : « il faut vraiment que ça soit fluide pour l'acheteur, qu'il
   puisse tout faire depuis son espace ». Sur un bien qu'il a visité :

     1. son prix — le total qu'il paiera, frais d'agence compris. Le calcul
        se fait sous ses yeux : ce qui part au vendeur (arrondi au millier
        au-dessus, src/lib/actes/offre-achat.ts), nos honoraires, et ce que
        son offre représente face au prix affiché ;
     2. ses informations — reprises de son mandat (naissance comprise), un
        co-acquéreur s'il achète à plusieurs (4 au plus, chacun signe avec
        son propre code), son financement, ses conditions ;
     3. le récapitulatif, et deux chemins : « Signer mon offre » (un code par
        e-mail, puis sa signature du doigt) ou « La faire relire par mon
        conseiller » (Alexandre la relit dans Documents, puis l'envoie pour
        signature).

   Après une contre-proposition du vendeur, pas de relecture (Alexandre) :
   il l'accepte (une nouvelle offre à ce prix, qu'il signe) ou il en fait
   une autre. Le serveur refait tous les calculs (/api/espace/offre).

   `CarteOffre` : où en est son offre, avec l'historique et le geste du
   moment — la même carte dans « Vos visites », sur la fiche du bien et sur
   l'accueil. Aucun mot de métier, jamais le nom d'une agence (AGENTS.md §5).
   ════════════════════════════════════════════════════════════════════════ */

import { useEffect, useMemo, useRef, useState } from 'react';
import { Champ, ChampDate, Ic } from './SignatureMandat';
import { BlocAdresse, BlocNaissance, couperAdresseSaisie, joindreAdresseSaisie, type AdresseSaisie } from './ChampsLieu';
import { validerMandant, validerPersonne, type Mandant } from '@/lib/mandat';
import { decomposer, totalPourPrix, VALIDITE_JOURS } from '@/lib/actes/offre-achat';
import { ETATS_CLIENT, FINIES, type OffreEspace, type SaisieOffre, type Ton } from '@/lib/offres';

/* ── Ce que l'espace lui passe ── */
export type HonoOffre = { mode: 'aucun' | 'taux' | 'forfait'; val: number };
export type BienOffre = {
  id: string; titre: string; meta: string; photo: string | null;
  /** Le prix affiché (celui de l'annonce, pour le vendeur). */
  prix: number | null;
  honoOffre: HonoOffre;
};
/** `depuis` : l'offre du fil qu'elle suit. `contre` : la proposition du
    vendeur (une autre offre ou son acceptation ne passent pas par la relecture).
    `accepter` : il accepte cette proposition. */
export type ModeOffre = { depuis?: string | null; derniere?: number | null; contre?: OffreEspace['contre'] | null; accepter?: boolean };
type Envoyer = (route: string, corps: Record<string, unknown>) => Promise<any>; // eslint-disable-line @typescript-eslint/no-explicit-any

/* ── Les outils ── */
const EUR = (n: number | null | undefined) => (n == null ? '—' : `${Math.round(n).toLocaleString('fr-FR').replace(/[   ]/g, ' ')} €`);
const chiffres = (s: string) => Number(String(s || '').replace(/[^\d]/g, '')) || 0;
const espaces = (s: string) => { const d = String(s || '').replace(/[^\d]/g, '').slice(0, 9); return d ? Number(d).toLocaleString('fr-FR').replace(/[  ]/g, ' ') : ''; };
const jourParis = (d = new Date()) => new Intl.DateTimeFormat('fr-CA', { timeZone: 'Europe/Paris' }).format(d);
const dans = (j: number) => jourParis(new Date(Date.now() + j * 86_400_000));
const jourLong = (ymd: string) => {
  const t = new Date(/^\d{4}-\d{2}-\d{2}$/.test(ymd) ? `${ymd}T12:00:00` : ymd);
  return Number.isFinite(t.getTime()) ? t.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'Europe/Paris' }) : '';
};
const jourCourt = (iso: string) => {
  const t = new Date(/^\d{4}-\d{2}-\d{2}$/.test(iso) ? `${iso}T12:00:00` : iso);
  return Number.isFinite(t.getTime()) ? t.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', timeZone: 'Europe/Paris' }) : '';
};
const heureDe = (iso: string) => {
  const t = new Date(iso);
  if (!Number.isFinite(t.getTime())) return '';
  const h = t.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Paris' });
  return h === '23:59' ? '' : h.replace(':00', ' h').replace(':', ' h ');
};
const majuscule = (t: string) => t.charAt(0).toUpperCase() + t.slice(1);
const nomDe = (p: { prenom: string; nom: string }) => `${p.prenom} ${p.nom}`.trim();
const initiales = (p: { prenom: string; nom: string }) => `${p.prenom.trim().charAt(0)}${p.nom.trim().charAt(0)}`.toUpperCase() || '·';
const VIDE: Mandant = { civilite: '', prenom: '', nom: '', naissanceDate: '', naissanceLieu: '', adresse: '', email: '', telephone: '' };
const versMandant = (p: Partial<Record<keyof Mandant, string>> | null | undefined): Mandant => ({
  ...VIDE, ...(p || {}),
  civilite: p?.civilite === 'Madame' || p?.civilite === 'Monsieur' ? p.civilite : '',
});

/* Son total → le prix pour le vendeur et nos honoraires, comme le serveur. */
function honoDonnees(h: HonoOffre): Record<string, unknown> {
  return h.mode === 'taux' ? { honoMode: 'taux', honoTaux: h.val } : h.mode === 'forfait' ? { honoMode: 'forfait', honoForfait: h.val } : { honoMode: 'aucun' };
}
export function calculOffre(h: HonoOffre, total: number): { prix: number | null; hono: number } {
  if (!total) return { prix: null, hono: 0 };
  return decomposer({ ...honoDonnees(h), total });
}
/* Son total face au prix affiché : ce qu'il gagne (la phrase reprise au
   moment de signer, ecartPrixAffiche). */
function ecart(total: number, affiche: number | null, prixVendeur?: number | null): { t: string; gain: boolean } | null {
  if (!affiche || !total) return null;
  const d = affiche - total;
  if (prixVendeur && Math.abs(prixVendeur - affiche) < 1 && d < 0) return { t: 'Le prix affiché, nos honoraires en plus', gain: false };
  if (Math.abs(d) < 1) return { t: `Au prix affiché (${EUR(affiche)})`, gain: false };
  return d > 0
    ? { t: `Soit ${EUR(d)} de moins que le prix affiché (${EUR(affiche)})`, gain: true }
    : { t: `Soit ${EUR(-d)} de plus que le prix affiché (${EUR(affiche)})`, gain: false };
}

/* Les messages du serveur, dits simplement. */
const REFUS: Record<string, string> = {
  plus_dispo: 'Ce bien n’est plus disponible : il vient d’être réservé ou retiré de la vente. Votre conseiller vous en parle.',
  pas_visite: 'Une offre se fait sur un bien que vous avez visité. Votre conseiller peut vous en parler.',
  agence: 'Pour ce bien, votre offre passe par votre conseiller : appelez-le, il la prépare avec vous.',
  acceptee: 'Votre offre sur ce bien est déjà acceptée : votre conseiller organise la suite avec vous.',
  en_preparation: 'Votre conseiller prépare déjà votre nouvelle offre : vous la recevez très vite pour signature.',
  en_cours: 'Une offre est déjà en cours sur ce bien : vous la retrouvez dans « Vos visites ».',
  depasse: 'Votre offre a avancé entre-temps : rechargez la page pour voir où elle en est.',
  contre_depassee: 'La proposition du vendeur a expiré. Vous pouvez faire une autre offre, ou en parler avec votre conseiller.',
  mandat: 'Votre conseiller doit d’abord finaliser votre dossier : appelez-le, il prépare l’offre avec vous.',
  total: 'Indiquez le montant de votre offre.',
  acquereurs: 'Indiquez qui achète.',
};

/* ═══ Les « ? » : une explication qui se déplie sous la ligne ═══
   (AGENTS.md §5 : tout chiffre qui n'est pas évident porte un « ? ».) */
function BoutonQ({ ouvert, titre, onClick }: { ouvert: boolean; titre: string; onClick: () => void }) {
  return <button type="button" className="ofr-q" aria-expanded={ouvert} aria-label={`Explication : ${titre}`} onClick={onClick}>?</button>;
}
function LigneCalc({ l, v, aide, tot }: { l: string; v: string; aide?: string; tot?: boolean }) {
  const [o, setO] = useState(false);
  return (
    <>
      <div className={'ofr-l' + (tot ? ' tot' : '')}>
        <span>{l}{aide ? <BoutonQ ouvert={o} titre={l} onClick={() => setO(x => !x)} /> : null}</span>
        <b className="tab">{v}</b>
      </div>
      {aide && o && <p className="ofr-expl">{aide}</p>}
    </>
  );
}
/** Une explication dépliable, sous un titre (la proposition du vendeur, la date de validité). */
export function Explique({ titre, children, texte }: { titre: string; children: React.ReactNode; texte: string }) {
  const [o, setO] = useState(false);
  return (
    <>
      <span className="ofr-ex-t">{children}<BoutonQ ouvert={o} titre={titre} onClick={() => setO(x => !x)} /></span>
      {o && <span className="ofr-expl ofr-expl-b">{texte}</span>}
    </>
  );
}
/* Ce que valent nos honoraires sur ce bien, dit simplement. */
const motHono = (h: HonoOffre) => (h.mode === 'taux'
  ? `${String(h.val).replace('.', ',')} % du prix proposé au vendeur`
  : h.mode === 'forfait' ? `un forfait de ${EUR(h.val)}` : '');
export const AIDE_CONTRE = 'C’est le prix que demande le vendeur (les honoraires de son agence compris, s’il en a une), plus nos honoraires, comptés une seule fois sur ce prix. Rien d’autre ne s’ajoute, hors frais de notaire.';

/* ═══ La saisie d'un acquéreur (au niveau du module : AGENTS.md §2.4) ═══ */
function FormAcq({ p, i, err, emailFige, meme, onP, onMeme, onFermer, onRetirer }: {
  p: Mandant; i: number; err: Record<string, string>; emailFige: boolean; meme: boolean;
  onP: (p: Mandant) => void; onMeme: (b: boolean) => void; onFermer: () => void; onRetirer: () => void;
}) {
  const [adr, setAdr] = useState<AdresseSaisie>(() => couperAdresseSaisie(p.adresse));
  const maj = (k: keyof Mandant) => (v: string) => onP({ ...p, [k]: v });
  const changeAdr = (x: AdresseSaisie) => { setAdr(x); onP({ ...p, adresse: joindreAdresseSaisie(x) }); };
  const lui = i > 0;
  return (
    <div className="mdt-perso">
      <div className="mdt-perso-t">
        <span className="n">{lui ? `Acquéreur ${i + 1}` : 'Vous'}</span>
        {lui && <button type="button" className="mdt-qui-a" onClick={onRetirer}>Retirer</button>}
      </div>
      <div className={'mdt-civ' + (err.civilite ? ' err' : '')}>
        {(['Madame', 'Monsieur'] as const).map(c => (
          <button key={c} type="button" data-on={p.civilite === c ? '1' : undefined} onClick={() => onP({ ...p, civilite: c })}>{c}</button>
        ))}
      </div>
      {err.civilite && <div className="mdt-err-l">{err.civilite}</div>}
      <div className="mdt-deux">
        <Champ lib="Prénom" val={p.prenom} onChange={maj('prenom')} err={err.prenom} auto={lui ? 'off' : 'given-name'} />
        <Champ lib="Nom" val={p.nom} onChange={maj('nom')} err={err.nom} auto={lui ? 'off' : 'family-name'} />
      </div>
      <BlocNaissance civilite={p.civilite} val={p.naissanceLieu} onChange={maj('naissanceLieu')} err={err.naissanceLieu}
        date={<ChampDate lib="Date de naissance" val={p.naissanceDate} onChange={maj('naissanceDate')} err={err.naissanceDate} />} />
      {lui && (
        <button type="button" className="mdt-coche mdt-leger" data-on={meme ? '1' : undefined} onClick={() => onMeme(!meme)}>
          <span className="bx">{meme && <Ic n="check" t={14} />}</span><span>Même adresse que moi</span>
        </button>
      )}
      {(!lui || !meme) && <BlocAdresse adr={adr} onAdr={changeAdr} champs={{ adresse: err.adresse }} tiers={lui} libRue={lui ? 'Son adresse' : 'Adresse'} />}
      <Champ lib={lui ? 'Son e-mail — son lien de signature arrive ici' : 'E-mail — votre code arrive ici'} val={p.email} onChange={maj('email')}
        err={err.email} type="email" mode="email" auto={lui ? 'off' : 'email'} lecture={emailFige} />
      <Champ lib={lui ? 'Son téléphone (facultatif)' : 'Téléphone (facultatif)'} val={p.telephone} onChange={maj('telephone')} err={err.telephone} type="tel" mode="tel" auto={lui ? 'off' : 'tel'} />
      <button type="button" className="btn fant" onClick={onFermer}>C’est bon</button>
    </div>
  );
}

/* Un montant tapé en euros, les espaces posés tout seuls. */
function ChampEuros({ lib, val, onChange, err, placeholder }: { lib: string; val: string; onChange: (v: string) => void; err?: string; placeholder?: string }) {
  return (
    <label className={'mdt-ch' + (err ? ' err' : '')}>
      <span className="l">{lib}</span>
      <span className="ofr-eu">
        <input inputMode="numeric" value={val} placeholder={placeholder} onChange={e => onChange(espaces(e.target.value))} />
        <i>€</i>
      </span>
      {err && <span className="e">{err}</span>}
    </label>
  );
}

/* ═══ Le parcours ═══════════════════════════════════════════════════════ */
type Etape = 'prix' | 'vous' | 'recap' | 'signer' | 'relire';

export default function FaireOffre({ bien, mode = {}, identite, saisie, apportDossier, mandatSigne, envoyer, tel, onFermer, onOffres }: {
  bien: BienOffre;
  mode?: ModeOffre;
  /** Lui (repris de son mandat), puis ceux qui l'ont signé avec lui. */
  identite: SaisieOffre['acquereurs'];
  /** Ce qu'il avait saisi sur l'offre d'avant (une autre offre, une acceptation). */
  saisie?: SaisieOffre | null;
  /** L'apport noté dans son dossier, pour pré-remplir. */
  apportDossier?: number | null;
  /** Son mandat de recherche est signé : il peut signer seul une offre qui porte nos honoraires. */
  mandatSigne: boolean;
  envoyer: Envoyer;
  tel: string;
  onFermer: () => void;
  /** Les offres de ses biens, telles que le serveur les rend après coup. */
  onOffres: (o: Record<string, OffreEspace>) => void;
}) {
  const contre = mode.contre || null;
  const accepter = !!mode.accepter && !!contre;
  const h = bien.honoOffre;
  const affiche = bien.prix;

  const [etape, setEtape] = useState<Etape>('prix');
  const haut = useRef<HTMLDivElement>(null);
  useEffect(() => { haut.current?.closest('.feuille')?.scrollTo({ top: 0 }); }, [etape]);

  /* 1. Son prix */
  const [totalTxt, setTotalTxt] = useState('');
  const [errPrix, setErrPrix] = useState('');
  /* « Proposer le prix affiché » : le prix de l'annonce part tel quel au
     vendeur (pas d'arrondi qui le ferait passer au-dessus). */
  const [auPrixChoisi, setAuPrixChoisi] = useState(false);
  const auPrix = affiche ? totalPourPrix(honoDonnees(h), affiche) : null;
  const total = accepter && contre ? contre.total : chiffres(totalTxt);
  const calc = useMemo(() => (accepter && contre ? { prix: contre.prix, hono: contre.total - contre.prix }
    : auPrixChoisi && affiche && auPrix && total === auPrix ? { prix: affiche, hono: auPrix - affiche }
      : calculOffre(h, total)), [accepter, contre, h, total, auPrixChoisi, affiche, auPrix]);
  const gain = ecart(total, affiche, calc.prix);

  /* 2. Ses informations : celles de l'offre d'avant, sinon son mandat */
  const depart = (saisie?.acquereurs?.length ? saisie.acquereurs : identite).slice(0, 4).map(versMandant);
  if (!depart.length) depart.push({ ...VIDE });
  const emailFiche = identite[0]?.email || '';
  if (emailFiche) depart[0] = { ...depart[0], email: emailFiche };
  const [pers, setPers] = useState<Mandant[]>(depart);
  const [memes, setMemes] = useState<boolean[]>(() => depart.map((p, i) => i > 0 && (!p.adresse || p.adresse === depart[0].adresse)));
  const [ouvert, setOuvert] = useState<number | null>(null);
  const [errs, setErrs] = useState<Record<number, Record<string, string>>>({});
  const [pret, setPret] = useState<'oui' | 'non'>(saisie?.pret === 'non' ? 'non' : 'oui');
  const [apport, setApport] = useState(espaces(String(saisie?.apport ?? apportDossier ?? '')));
  const [pretMontant, setPretMontant] = useState(espaces(String(saisie?.pretMontant ?? '')));
  const [pretDuree, setPretDuree] = useState(String(saisie?.pretDuree ?? 25));
  const [pretTaux, setPretTaux] = useState(saisie?.pretTaux != null ? String(saisie.pretTaux).replace('.', ',') : '');
  const [vente, setVente] = useState(!!saisie?.conditions?.includes('vente'));
  const [venteBien, setVenteBien] = useState(saisie?.venteBien || '');
  const [autre, setAutre] = useState(!!saisie?.conditions?.includes('autre'));
  const [conditionAutre, setConditionAutre] = useState(saisie?.conditionAutre || '');
  const [notaire, setNotaire] = useState(saisie?.notaire || '');

  /* 3. Le récapitulatif */
  const [validite, setValidite] = useState(dans(VALIDITE_JOURS));
  const [changerDate, setChangerDate] = useState(false);
  const [envoi, setEnvoi] = useState<'' | 'signer' | 'relire'>('');
  const [erreur, setErreur] = useState('');
  const [fait, setFait] = useState<{ lien: string | null; force?: boolean; repli?: boolean } | null>(null);

  /* Ce qu'il peut choisir : après une contre-proposition, signer seulement ;
     sans mandat signé (et des honoraires), la relecture seulement. */
  const seulSigner = !!contre;
  const seulRelire = !contre && calc.hono > 0 && !mandatSigne;

  const personnes = (): Mandant[] => pers.map((p, i) => (i > 0 && memes[i] ? { ...p, adresse: pers[0].adresse } : p));
  const controler = (): Record<number, Record<string, string>> => {
    const out: Record<number, Record<string, string>> = {};
    const pris: string[] = [];
    personnes().forEach((p, i) => {
      const v = i === 0 ? validerMandant(p) : validerPersonne(p, pris);
      if (!v.ok) out[i] = v.champs; else pris.push(v.mandant.email);
    });
    return out;
  };
  const completeDe = (i: number) => {
    const p = personnes()[i];
    return (i === 0 ? validerMandant(p) : validerPersonne(p, personnes().slice(0, i).map(x => x.email))).ok;
  };
  /* Après la 1re étape : si tout est déjà là (une offre d'avant), droit au récapitulatif. */
  const suitePrix = () => {
    if (!accepter) {
      if (total < 10_000) { setErrPrix('Indiquez le montant total de votre offre, frais d’agence compris.'); return; }
      if (affiche && total > affiche * 2) { setErrPrix('Ce montant semble très élevé : vérifiez-le.'); return; }
    }
    setErrPrix('');
    setEtape(saisie && !Object.keys(controler()).length ? 'recap' : 'vous');
  };
  const suiteVous = () => {
    const e = controler();
    setErrs(e);
    const premier = Object.keys(e).map(Number).sort((a, b) => a - b)[0];
    if (premier !== undefined) { setOuvert(premier); setErreur('Il manque quelques informations : elles sont en rouge.'); return; }
    setErreur(''); setOuvert(null);
    setEtape('recap');
  };

  const envoyerOffre = async (choix: 'signer' | 'relire') => {
    setEnvoi(choix); setErreur('');
    const ps = personnes();
    const r = await envoyer('offre', {
      action: 'creer', bien_id: bien.id, choix,
      depuis: mode.depuis || null, accepter,
      saisie: {
        acquereurs: ps, total: accepter ? null : total, auPrix: !accepter && auPrixChoisi && total === auPrix,
        apport: chiffres(apport) || null, pret,
        pretMontant: pret === 'oui' ? chiffres(pretMontant) || null : null,
        pretDuree: pret === 'oui' ? Number(pretDuree) || null : null,
        pretTaux: pret === 'oui' && pretTaux.trim() ? Number(pretTaux.replace(',', '.')) : null,
        conditions: [vente ? 'vente' : '', autre ? 'autre' : ''].filter(Boolean),
        venteBien: vente ? venteBien : '', conditionAutre: autre ? conditionAutre : '', notaire,
        validite, validiteHeure: '18:00',
      },
    });
    setEnvoi('');
    if (r?.ok) {
      if (r.offres && typeof r.offres === 'object') onOffres(r.offres as Record<string, OffreEspace>);
      if (r.etat === 'en_signature') { setFait({ lien: typeof r.lien === 'string' ? r.lien : null }); setEtape('signer'); return; }
      setFait({ lien: null, force: !!r.forceRelire, repli: !!r.repli }); setEtape('relire');
      return;
    }
    const code = String(r?.error || '');
    if (code === 'identite' && r.champs && typeof r.champs === 'object') {
      const e: Record<number, Record<string, string>> = {};
      for (const [k, v] of Object.entries(r.champs as Record<string, Record<string, string>>)) e[Number(k.replace('a', ''))] = v;
      setErrs(e);
      setOuvert(Object.keys(e).map(Number).sort((a, b) => a - b)[0] ?? null);
      setErreur('Il manque quelques informations : elles sont en rouge.');
      setEtape('vous');
      return;
    }
    if (code === 'total') { setErrPrix(REFUS.total); setEtape('prix'); return; }
    setErreur(REFUS[code] || `Votre offre n’est pas partie : un souci de connexion, sans doute. Réessayez dans un instant, ou appelez votre conseiller au ${tel}.`);
  };

  /* ── l'en-tête et les trois pas ── */
  const pas = etape === 'prix' ? 1 : etape === 'vous' ? 2 : etape === 'recap' ? 3 : 0;
  const retour = etape === 'vous' ? 'prix' : etape === 'recap' ? 'vous' : null;
  const tete = (
    <div className="mdt-tete" ref={haut}>
      <div className="mdt-tete-g">
        {retour && (
          <button type="button" className="mdt-rond" aria-label="Retour" onClick={() => { setErreur(''); setEtape(retour); }}>
            <Ic n="chevron" t={16} />
          </button>
        )}
        <span className="mdt-sur">{pas ? `${accepter ? 'Accepter la proposition' : 'Votre offre'} · étape ${pas} sur 3` : 'Votre offre'}</span>
      </div>
      <button type="button" className="mdt-rond" aria-label="Fermer" onClick={onFermer}><Ic n="croix" t={14} /></button>
    </div>
  );
  const barre = pas ? (
    <div className="mdt-pas" aria-label={`Étape ${pas} sur 3`}>
      {[1, 2, 3].map(i => <i key={i} data-on={i <= pas ? '1' : undefined} />)}
    </div>
  ) : null;
  const leBien = (
    <div className="ofr-bien">
      <span className="ofr-ph">{bien.photo ? <img src={bien.photo} alt="" /> : <Ic n="maison" t={20} />}</span>
      <span className="ofr-bt">
        <b>{bien.titre}</b>
        <span>{bien.meta}</span>
        {affiche ? <span className="ofr-aff">{`Prix affiché : ${EUR(affiche)}`}</span> : null}
      </span>
    </div>
  );

  /* ── fini : il signe, ou son conseiller relit ── */
  if (etape === 'signer' && fait) {
    const autres = personnes().slice(1).map(p => p.prenom || nomDe(p)).filter(Boolean);
    return (
      <div className="mdt">
        {tete}
        <div className="mdt-corps mdt-fini">
          <div className="mdt-sceau"><Ic n="plume" t={30} /></div>
          <h3>Votre offre est prête</h3>
          <p className="mdt-p">{`Il ne reste qu’à la signer : vous recevez un code par e-mail, puis vous signez du doigt. Votre offre de ${EUR(total)} part au vendeur dès qu’elle est signée.`}</p>
          {autres.length > 0 && (
            <div className="mdt-info"><Ic n="mail" t={16} /><span>{`${autres.join(' et ')} ${autres.length > 1 ? 'reçoivent leur' : 'reçoit son'} propre lien par e-mail, pour signer à ${autres.length > 1 ? 'leur' : 'son'} tour.`}</span></div>
          )}
          {fait.lien
            ? <a className="btn or mdt-plein" href={fait.lien}><Ic n="plume" t={17} /><span>Signer mon offre</span></a>
            : <p className="mdt-p petit">{'Votre lien de signature vous attend dans votre boîte mail, et dans « Un document vous attend » sur votre accueil.'}</p>}
          <button type="button" className="btn lien" onClick={onFermer}>Plus tard : elle m’attend dans mon espace</button>
        </div>
      </div>
    );
  }
  if (etape === 'relire' && fait) {
    return (
      <div className="mdt">
        {tete}
        <div className="mdt-corps mdt-fini">
          <div className="mdt-ok"><Ic n="check" t={34} /></div>
          <h3>C’est envoyé à votre conseiller</h3>
          <p className="mdt-p">{fait.repli
            ? `La signature n’a pas pu partir tout de suite : Alexandre reprend votre offre de ${EUR(total)} et vous l’envoie pour signature. Vous recevrez un e-mail.`
            : fait.force
              ? `Alexandre relit votre offre de ${EUR(total)} et finalise votre dossier avec vous. Il vous l’envoie ensuite pour signature : vous recevrez un e-mail.`
              : `Alexandre relit votre offre de ${EUR(total)}. Il vous l’envoie ensuite pour signature : vous recevrez un e-mail, et elle vous attendra dans votre espace.`}</p>
          <div className="ofr-rassure"><Ic n="bouclier" t={18} /><span>{'Il défend ensuite votre offre auprès du vendeur, et vous prévient dès sa réponse.'}</span></div>
          <button type="button" className="btn or mdt-plein" onClick={onFermer}>Revenir à mon espace</button>
        </div>
      </div>
    );
  }

  /* ── 1. Le prix ── */
  if (etape === 'prix') {
    return (
      <div className="mdt">
        {tete}
        {barre}
        <div className="mdt-corps">
          {leBien}
          {accepter && contre ? (
            <>
              <h3>La proposition du vendeur</h3>
              <div className="mdt-total">
                <div className="t"><Explique titre="La proposition du vendeur" texte={AIDE_CONTRE}>{'Le vendeur propose, frais d’agence compris'}</Explique></div>
                <div className="v">{EUR(contre.total)}</div>
                <div className="d">{calc.hono > 0
                  ? `dont ${EUR(contre.prix)} pour le vendeur et ${EUR(calc.hono)} de nos honoraires · hors frais de notaire`
                  : 'rien de plus à payer, hors frais de notaire'}</div>
                {gain?.gain && <div className="g">{gain.t}</div>}
              </div>
              {mode.derniere ? <p className="mdt-p petit">{`Votre dernière offre : ${EUR(mode.derniere)}${contre.limite ? ` · sa proposition vaut jusqu’au ${jourLong(contre.limite)}` : ''}.`}</p> : null}
              <p className="mdt-p">{'Pour l’accepter, vous signez une nouvelle offre à ce prix. Votre conseiller la transmet aussitôt au vendeur.'}</p>
              <button type="button" className="btn or mdt-plein" onClick={suitePrix}>{`J’accepte ${EUR(contre.total)}`}</button>
            </>
          ) : (
            <>
              <h3>{contre || mode.derniere ? 'Votre nouvelle offre' : 'Votre prix'}</h3>
              <p className="mdt-p">{'Le montant total que vous proposez, frais d’agence compris : c’est ce que vous paierez, hors frais de notaire.'}</p>
              {(contre || mode.derniere) && (
                <div className="ofr-avant">
                  {mode.derniere ? <span><i className="pt or" />{`Votre dernière offre : ${EUR(mode.derniere)}`}</span> : null}
                  {contre ? <span><i className="pt violet" />{`Le vendeur propose : ${EUR(contre.total)}`}</span> : null}
                </div>
              )}
              <label className={'ofr-saisie' + (errPrix ? ' rouge' : '')}>
                <span className="l">Votre offre, frais d’agence compris</span>
                <span className="ofr-eu grand">
                  <input inputMode="numeric" autoFocus value={totalTxt} placeholder="Votre montant"
                    onChange={e => { setTotalTxt(espaces(e.target.value)); setErrPrix(''); setAuPrixChoisi(false); }} aria-describedby="ofr-calc" />
                  <i>€</i>
                </span>
                {errPrix && <span className="e">{errPrix}</span>}
              </label>
              {auPrix && !contre ? (
                <button type="button" className="ofr-auprix" onClick={() => { setTotalTxt(espaces(String(auPrix))); setErrPrix(''); setAuPrixChoisi(true); }}>
                  <Ic n="etiquette" t={15} /><span>{h.mode === 'aucun' ? `Proposer le prix affiché (${EUR(auPrix)})` : `Proposer le prix affiché, soit ${EUR(auPrix)} frais d’agence compris`}</span>
                </button>
              ) : null}
              <div className="ofr-calc" id="ofr-calc" aria-live="polite" data-vide={total >= 10_000 ? undefined : '1'}>
                <LigneCalc l="Proposé au vendeur" v={total >= 10_000 ? EUR(calc.prix) : '—'}
                  aide={`C’est le prix écrit sur votre offre, celui que le vendeur lit. Il comprend déjà les honoraires de son agence, s’il en a une.${h.mode !== 'aucun' ? ' Il est arrondi au millier au-dessus, pour un chiffre rond.' : ''}`} />
                {h.mode !== 'aucun' && (
                  <LigneCalc l="Nos honoraires" v={total >= 10_000 ? EUR(calc.hono) : '—'}
                    aide={`Ceux de votre conseiller sur ce bien : ${motHono(h)}, comptés une seule fois. Avec l’arrondi du prix au millier, ils sont un peu en dessous, jamais au-dessus. Ils ne figurent pas sur l’offre que lit le vendeur.`} />
                )}
                <LigneCalc l="Vous payez, frais d’agence compris" v={total >= 10_000 ? EUR(total) : '—'} tot
                  aide="C’est exactement le montant que vous avez indiqué. Seuls les frais de notaire s’y ajouteront, comme pour tout achat." />
                {total >= 10_000 && gain ? <div className={'ofr-gain' + (gain.gain ? '' : ' neutre')}>{gain.gain && <Ic n="check" t={14} />}<span>{gain.t}</span></div> : null}
              </div>
              <div className="ofr-rassure"><Ic n="bouclier" t={18} /><span>{'Votre conseiller défend votre offre auprès du vendeur, pour l’obtenir au meilleur prix, et vous prévient dès sa réponse.'}</span></div>
              <button type="button" className="btn or mdt-plein" onClick={suitePrix}>Continuer</button>
            </>
          )}
        </div>
      </div>
    );
  }

  /* ── 2. Ses informations ── */
  if (etape === 'vous') {
    const liste = personnes();
    return (
      <div className="mdt">
        {tete}
        {barre}
        <div className="mdt-corps">
          <h3>Vos informations</h3>
          <p className="mdt-p">{'Elles figurent sur l’offre. Vérifiez-les, et complétez ce qui manque.'}</p>

          <div className="mdt-q2">Qui achète&nbsp;?</div>
          <div className="mdt-qui">
            {liste.map((p, i) => {
              const ok = completeDe(i);
              const e = errs[i] || {};
              return (
                <div key={i} className="ofr-acq">
                  <div className="mdt-qui-l">
                    <span className={'mdt-av' + (i ? ' b' : '')}>{initiales(p)}</span>
                    <span className="mdt-qui-tx">
                      <b>{nomDe(p) || (i ? `Acquéreur ${i + 1}` : 'Vous')}</b>
                      <span className={ok ? '' : 'ofr-manque'}>{ok
                        ? [p.naissanceDate ? `${p.civilite === 'Madame' ? 'née' : p.civilite === 'Monsieur' ? 'né' : 'né(e)'} le ${p.naissanceDate.split('-').reverse().join('/')}` : '', p.email].filter(Boolean).join(' · ')
                        : Object.keys(e).length ? 'À compléter' : 'Quelques informations à compléter'}</span>
                    </span>
                    {ouvert !== i && <button type="button" className="mdt-qui-a" onClick={() => setOuvert(i)}>{ok ? 'Modifier' : 'Compléter'}</button>}
                  </div>
                  {ouvert === i && (
                    <FormAcq p={pers[i]} i={i} err={e} emailFige={i === 0 && !!emailFiche} meme={!!memes[i]}
                      onP={x => { setPers(l => l.map((y, j) => (j === i ? x : y))); setErrs(m => ({ ...m, [i]: {} })); }}
                      onMeme={b => setMemes(l => l.map((y, j) => (j === i ? b : y)))}
                      onFermer={() => setOuvert(null)}
                      onRetirer={() => { setPers(l => l.filter((_, j) => j !== i)); setMemes(l => l.filter((_, j) => j !== i)); setErrs({}); setOuvert(null); }} />
                  )}
                </div>
              );
            })}
          </div>
          {pers.length < 4 && (
            <button type="button" className="mdt-ajout" onClick={() => { setPers(l => [...l, { ...VIDE }]); setMemes(l => [...l, true]); setOuvert(pers.length); }}>
              <Ic n="plus" t={17} /><span>{pers.length > 1 ? 'Ajouter un autre acquéreur' : 'J’achète à deux : ajouter un co-acquéreur'}</span>
            </button>
          )}
          {pers.length > 1 && (
            <div className="mdt-info"><Ic n="groupe" t={16} /><span>{'Chacun signe avec son propre code : les autres acquéreurs reçoivent leur lien par e-mail dès que l’offre est prête.'}</span></div>
          )}

          <div className="mdt-q2">Votre financement</div>
          <div className="mdt-seg">
            <button type="button" data-on={pret === 'oui' ? '1' : undefined} onClick={() => setPret('oui')}><Ic n="banque" t={17} /><span>Avec un prêt</span></button>
            <button type="button" data-on={pret === 'non' ? '1' : undefined} onClick={() => setPret('non')}><Ic n="euro" t={17} /><span>Sans prêt</span></button>
          </div>
          <div className="mdt-deux">
            <ChampEuros lib={pret === 'oui' ? 'Votre apport (facultatif)' : 'Vos fonds propres (facultatif)'} val={apport} onChange={setApport} placeholder="Ex. : 100 000" />
            {pret === 'oui' && <ChampEuros lib="Montant du prêt (facultatif)" val={pretMontant} onChange={setPretMontant} placeholder="Ex. : 400 000" />}
          </div>
          {pret === 'oui' && (
            <div className="mdt-deux">
              <Champ lib="Durée du prêt, en années" val={pretDuree} onChange={v => setPretDuree(v.replace(/[^\d]/g, '').slice(0, 2))} mode="numeric" />
              <Champ lib="Taux maximum, en % (facultatif)" val={pretTaux} onChange={v => setPretTaux(v.replace(/[^\d,.]/g, '').slice(0, 5))} mode="text" placeholder="Ex. : 3,8" />
            </div>
          )}
          {pret === 'oui' && <div className="mdt-info"><Ic n="info" t={16} /><span>{'L’obtention de votre prêt sera une condition du compromis : c’est ce qui vous protège si la banque dit non.'}</span></div>}

          <div className="mdt-q2">Une condition particulière&nbsp;? (facultatif)</div>
          <button type="button" className="mdt-coche mdt-leger" data-on={vente ? '1' : undefined} onClick={() => setVente(x => !x)}>
            <span className="bx">{vente && <Ic n="check" t={14} />}</span><span>{'Sous réserve de la vente de mon bien actuel'}</span>
          </button>
          {vente && <Champ lib="Lequel ?" val={venteBien} onChange={setVenteBien} placeholder="Ex. : mon appartement de Boulogne" auto="off" />}
          <button type="button" className="mdt-coche mdt-leger" data-on={autre ? '1' : undefined} onClick={() => setAutre(x => !x)}>
            <span className="bx">{autre && <Ic n="check" t={14} />}</span><span>Une autre condition</span>
          </button>
          {autre && <Champ lib="Laquelle ?" val={conditionAutre} onChange={setConditionAutre} placeholder="Ex. : sous réserve de l’accord de la copropriété pour…" auto="off" />}
          <Champ lib="Votre notaire, si vous en avez un (facultatif)" val={notaire} onChange={setNotaire} placeholder="Ex. : Maître Durand, à Boulogne" auto="off" />

          {erreur && <div className="mdt-erreur">{erreur}</div>}
          <button type="button" className="btn or mdt-plein" onClick={suiteVous}>Continuer</button>
        </div>
      </div>
    );
  }

  /* ── 3. Le récapitulatif, et les deux chemins ── */
  const liste = personnes();
  const conds = [vente ? `la vente de votre bien actuel${venteBien.trim() ? ` (${venteBien.trim()})` : ''}` : '', autre && conditionAutre.trim() ? conditionAutre.trim() : ''].filter(Boolean);
  const finCalc = `${jourLong(validite)} à 18 h`;
  return (
    <div className="mdt">
      {tete}
      {barre}
      <div className="mdt-corps">
        <h3>Votre offre, en clair</h3>
        <div className="mdt-total">
          <div className="t">{'Votre offre, frais d’agence compris'}</div>
          <div className="v">{EUR(total)}</div>
          <div className="d">{calc.hono > 0
            ? `dont ${EUR(calc.prix)} proposés au vendeur et ${EUR(calc.hono)} de nos honoraires · hors frais de notaire`
            : 'rien de plus à payer, hors frais de notaire'}</div>
          {gain?.gain && <div className="g">{gain.t}</div>}
        </div>
        <div className="mdt-lignes">
          <div className="mdt-ligne">
            <div className="t">Le bien</div>
            <div className="v">{bien.titre}</div>
            <div className="d">{bien.meta}</div>
          </div>
          <div className="mdt-ligne">
            <div className="t">{liste.length > 1 ? 'Les acquéreurs' : 'L’acquéreur'}</div>
            <div className="v">{liste.map(nomDe).join(', ')}</div>
            <div className="d"><button type="button" className="ofr-mod" onClick={() => setEtape('vous')}>Modifier</button></div>
          </div>
          <div className="mdt-ligne">
            <div className="t">Le financement</div>
            <div className="v">{pret === 'oui' ? `Avec un prêt${chiffres(pretMontant) ? ` de ${EUR(chiffres(pretMontant))}` : ''}` : 'Sans prêt'}</div>
            <div className="d">{[chiffres(apport) ? `${pret === 'oui' ? 'apport' : 'fonds propres'} : ${EUR(chiffres(apport))}` : '', conds.length ? `sous réserve de ${conds.join(' et de ')}` : ''].filter(Boolean).join(' · ') || 'aucune condition particulière'}</div>
          </div>
          <div className="mdt-ligne">
            <div className="t"><Explique titre="La date de validité" texte={`Le vendeur a jusqu’à cette date pour répondre. Sans réponse de sa part, votre offre tombe d’elle-même : vous n’avez rien à faire. ${VALIDITE_JOURS} jours, c’est l’usage ; vous pouvez choisir une date entre demain et dans trente jours.`}>{'Valable jusqu’au'}</Explique></div>
            <div className="v">{majuscule(finCalc)}</div>
            <div className="d">
              {changerDate ? (
                <input className="ofr-date" type="date" value={validite} min={dans(1)} max={dans(30)}
                  onChange={e => { if (/^\d{4}-\d{2}-\d{2}$/.test(e.target.value)) setValidite(e.target.value); }} />
              ) : (
                <button type="button" className="ofr-mod" onClick={() => setChangerDate(true)}>Changer la date</button>
              )}
            </div>
          </div>
        </div>

        {seulRelire && (
          <div className="mdt-info"><Ic n="info" t={16} /><span>{'Votre mandat de recherche n’est pas encore signé : votre conseiller relit votre offre et finalise votre dossier avec vous, puis vous l’envoie pour signature.'}</span></div>
        )}
        {erreur && <div className="mdt-erreur">{erreur}</div>}
        <div className="ofr-chemins">
          {!seulRelire && (
            <button type="button" className="ofr-chemin or" disabled={!!envoi} onClick={() => void envoyerOffre('signer')}>
              <span className="ic"><Ic n="plume" t={20} /></span>
              <span className="tx">
                <b>{envoi === 'signer' ? 'Préparation de votre offre…' : 'Signer mon offre'}</b>
                <span>{'Un code par e-mail, puis votre signature du doigt. Elle part au vendeur dès qu’elle est signée.'}</span>
              </span>
              {envoi === 'signer' ? <span className="tourne" aria-hidden="true" /> : <span className="ofr-fl"><Ic n="chevron" t={16} /></span>}
            </button>
          )}
          {!seulSigner && (
            <button type="button" className="ofr-chemin" disabled={!!envoi} onClick={() => void envoyerOffre('relire')}>
              <span className="ic"><Ic n="personne" t={20} /></span>
              <span className="tx">
                <b>{envoi === 'relire' ? 'Envoi à votre conseiller…' : 'La faire relire par mon conseiller'}</b>
                <span>{'Alexandre la relit, vous appelle si besoin, puis vous l’envoie pour signature.'}</span>
              </span>
              {envoi === 'relire' ? <span className="tourne" aria-hidden="true" /> : <span className="ofr-fl"><Ic n="chevron" t={16} /></span>}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

/* ═══ Où en est son offre ═══════════════════════════════════════════════ */

/* Le ton de chaque étape, dans les étiquettes de l'espace (.etiq). */
/* ⚠️ Pas « fait » : l'espace a déjà une classe .fait (un bloc). */
export const ETIQ_TON: Record<Ton, string> = { or: 'offre', bleu: 'vu', vert: 'oui', rouge: 'non', violet: 'visite', gris: 'gris' };

/** L'étiquette de son offre (« À signer » ne reste pas quand il a signé). */
export function libelleOffre(o: OffreEspace): string {
  if (o.enPreparation && (o.etat === 'contre' || FINIES.includes(o.etat))) return 'Nouvelle offre en préparation';
  if (o.etat === 'en_signature' && !o.lien && o.vousSigne) return 'Signature en cours';
  if (o.etat === 'contre' && o.contre?.depassee) return 'Proposition expirée';
  return ETATS_CLIENT[o.etat].l;
}

/** La phrase qui dit où en est son offre (sous l'étiquette). */
export function phraseOffre(o: OffreEspace): string {
  /* Le montant est dans l'en-tête de la carte : la phrase ne le répète pas. */
  if (o.enPreparation && (o.etat === 'contre' || FINIES.includes(o.etat))) return 'Votre conseiller prépare votre nouvelle offre : vous la recevez très vite pour signature.';
  switch (o.etat) {
    case 'a_relire': case 'brouillon': case 'a_finaliser':
      return 'Votre conseiller relit votre offre. Il vous l’envoie ensuite pour signature : vous recevrez un e-mail.';
    case 'en_signature':
      if (o.lien) return 'Votre offre est prête : signez-la pour qu’elle parte au vendeur.';
      if (o.vousSigne && o.attendus.length) return `Vous avez signé. On attend la signature de ${o.attendus.join(' et ')}, qui ${o.attendus.length > 1 ? 'ont reçu leur' : 'a reçu son'} lien par e-mail.`;
      return 'Votre offre est en signature.';
    case 'signee': return 'Votre offre est signée : votre conseiller la transmet au vendeur.';
    case 'envoyee': return `Votre offre est entre les mains du vendeur${o.envoyeLe ? ` depuis le ${jourCourt(o.envoyeLe)}` : ''}.${o.fin ? ` Il a jusqu’au ${jourCourt(o.fin)} pour répondre.` : ''}`;
    case 'contre': return o.contre?.depassee
      ? `La proposition du vendeur a expiré${o.contre.limite ? ` le ${jourCourt(o.contre.limite)}` : ''}. Vous pouvez faire une autre offre.`
      : 'Le vendeur a répondu à votre offre par une proposition.';
    case 'acceptee': return 'Le vendeur a accepté votre offre. Votre conseiller vous appelle pour organiser la suite : le compromis chez le notaire.';
    case 'refusee': return 'Le vendeur n’a pas retenu votre offre. La recherche continue, et vous pouvez en faire une nouvelle si vous le souhaitez.';
    case 'echue': return `Votre offre est arrivée à échéance${o.fin ? ` le ${jourCourt(o.fin)}` : ''}, sans réponse du vendeur. Vous pouvez en faire une nouvelle.`;
    case 'sans_suite': return 'Cette offre n’a pas eu de suite. La recherche continue, et vous pouvez en faire une nouvelle si vous le souhaitez.';
    default: return '';
  }
}

/* Le petit dessin de la fête, pour l'offre acceptée (pas d'émoji : AGENTS.md §5). */
function Fete({ t = 26 }: { t?: number }) {
  return (
    <svg width={t} height={t} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M4 20 9.5 7.5l7 7L4 20z" /><path d="M8.2 10.5c1.8 1.6 3.6 3.4 5.3 5.3" />
      <path d="M14 3.5v2" /><path d="M19 5l-1.5 1.5" /><path d="M20.5 10h-2" /><path d="M12.5 8.5c.8-1.6 2.2-2.4 4-2.4" /><path d="M15.5 11.5c1.3-.6 2.6-.6 4 .1" />
    </svg>
  );
}

/** La carte de son offre. `historique` : l'historique déplié d'office (sur la fiche du bien). */
export function CarteOffre({ o, indispo = false, historique: histOuvert = false, sansEtiquette = false, onAccepter, onAutre, onNouvelle, onSansSuite }: {
  o: OffreEspace;
  indispo?: boolean;
  historique?: boolean;
  /** La carte du bien porte déjà l'étiquette (« Vos visites »). */
  sansEtiquette?: boolean;
  onAccepter?: () => void;
  onAutre?: () => void;
  onNouvelle?: () => void;
  onSansSuite?: () => Promise<boolean>;
}) {
  const [hist, setHist] = useState(histOuvert);
  const [confirmer, setConfirmer] = useState(false);
  const [envoi, setEnvoi] = useState(false);
  const [rate, setRate] = useState(false);
  const e = ETATS_CLIENT[o.etat];
  const finie = FINIES.includes(o.etat);
  const contreActive = o.etat === 'contre' && !!o.contre && !o.enPreparation;
  /* Confiée à son conseiller, pas encore signée : il peut la retirer. */
  const peutRetirer = o.etat === 'a_relire' && !!onSansSuite;
  const peutNouvelle = finie && !o.enPreparation && !indispo && !!onNouvelle;
  const plusQue = o.contre && o.total ? o.contre.total - o.total : 0;

  const sansSuite = async () => {
    if (!onSansSuite) return;
    setEnvoi(true); setRate(false);
    const ok = await onSansSuite();
    setEnvoi(false);
    if (ok) setConfirmer(false); else setRate(true);
  };

  return (
    <div className={'ofr-c t-' + e.ton}>
      <div className="ofr-c-t">
        {sansEtiquette
          ? <span className="ofr-rang">{o.rang > 1 ? `Votre ${o.rang}e offre` : 'Votre offre'}</span>
          : <span className={'etiq ' + ETIQ_TON[e.ton]}>{o.etat === 'acceptee' ? <Fete t={13} /> : <Ic n="euro" t={13} />}{libelleOffre(o)}</span>}
        {/* À côté de « Réponse du vendeur », le montant doit dire que c'est le sien. */}
        {o.total ? (
          <span className="ofr-c-m">
            {!sansEtiquette && <small>{o.rang > 1 ? `votre ${o.rang}e offre` : 'votre offre'}</small>}
            <b className="tab">{EUR(o.total)}</b>
          </span>
        ) : null}
      </div>

      {o.etat === 'acceptee' ? (
        <div className="ofr-fete">
          <span className="ic"><Fete /></span>
          <span className="tx"><b>{'Félicitations, votre offre est acceptée !'}</b><span>{phraseOffre(o)}</span></span>
        </div>
      ) : contreActive && o.contre ? (
        <>
          <div className="ofr-contre">
            <div className="t"><Explique titre="La proposition du vendeur" texte={AIDE_CONTRE}>{'Le vendeur propose, frais d’agence compris'}</Explique></div>
            <div className="v tab">{EUR(o.contre.total)}</div>
            <div className="d">{[plusQue > 0 ? `soit ${EUR(plusQue)} de plus que votre offre` : '', o.contre.limite ? `${o.contre.depassee ? 'proposition expirée le' : 'valable jusqu’au'} ${jourCourt(o.contre.limite)}` : ''].filter(Boolean).join(' · ')}</div>
          </div>
          <p className="ofr-c-p">{o.contre.depassee ? phraseOffre(o) : 'Vous pouvez l’accepter, faire une autre offre, ou ne pas donner suite. Votre conseiller reste disponible pour en parler.'}</p>
        </>
      ) : (
        <p className="ofr-c-p">{phraseOffre(o)}</p>
      )}

      {o.etat === 'envoyee' && <div className="ofr-rassure serre"><Ic n="bouclier" t={16} /><span>{'Votre conseiller défend votre offre auprès du vendeur, et vous prévient dès sa réponse.'}</span></div>}
      {o.etat === 'en_signature' && o.fin && <p className="ofr-c-s">{`Valable jusqu’au ${jourCourt(o.fin)}${heureDe(o.fin) ? ` à ${heureDe(o.fin)}` : ''}`}</p>}

      {/* Le geste du moment */}
      {o.etat === 'en_signature' && o.lien && (
        <a className="btn or ofr-b" href={o.lien}><Ic n="plume" t={16} /><span>Signer mon offre</span></a>
      )}
      {contreActive && o.contre && !confirmer && (
        <div className="ofr-acts">
          {!o.contre.depassee && onAccepter && <button type="button" className="btn or ofr-b" onClick={onAccepter}>{`Accepter ${EUR(o.contre.total)}`}</button>}
          {onAutre && <button type="button" className={'btn ofr-b ' + (o.contre.depassee ? 'or' : 'fant')} onClick={onAutre}>Faire une autre offre</button>}
          {onSansSuite && <button type="button" className="btn lien ofr-ns" onClick={() => setConfirmer(true)}>Ne pas donner suite</button>}
        </div>
      )}
      {peutRetirer && !confirmer && (
        <button type="button" className="btn lien ofr-ns" onClick={() => setConfirmer(true)}>Je ne souhaite plus la faire</button>
      )}
      {confirmer && (
        <div className="ofr-conf">
          <b>{peutRetirer ? 'Vous retirez votre offre ?' : 'Vous ne donnez pas suite ?'}</b>
          <span>{peutRetirer
            ? 'Votre conseiller est prévenu. Vous pourrez en faire une autre sur ce bien quand vous voulez.'
            : 'Votre conseiller est prévenu, et la recherche continue. Vous pourrez toujours faire une nouvelle offre sur ce bien.'}</span>
          {rate && <span className="ofr-rate">{'Ce n’est pas parti : vérifiez votre connexion et réessayez.'}</span>}
          <div className="ofr-acts deux">
            <button type="button" className="btn fant ofr-b" disabled={envoi} onClick={() => setConfirmer(false)}>Annuler</button>
            <button type="button" className="btn encre ofr-b" disabled={envoi} onClick={() => void sansSuite()}>{envoi ? <><span className="tourne" aria-hidden="true" />Envoi…</> : 'Je confirme'}</button>
          </div>
        </div>
      )}
      {peutNouvelle && (
        <button type="button" className="btn fant ofr-b" onClick={onNouvelle}><Ic n="euro" t={16} /><span>Faire une nouvelle offre</span></button>
      )}

      {o.historique.length > 0 && (
        <div className={'ofr-h' + (hist ? ' ouvert' : '')}>
          <button type="button" className="ofr-h-b" aria-expanded={hist} onClick={() => setHist(x => !x)}>
            <span>{hist ? 'Masquer l’historique' : `Voir l’historique (${o.historique.length})`}</span>
            <span className="cv"><Ic n="deplier" t={15} /></span>
          </button>
          {hist && (
            <ol className="ofr-h-l">
              {o.historique.map((m, i) => (
                <li key={i} className={'t-' + m.ton}>
                  <i />
                  <span className="q">{jourCourt(m.le)}</span>
                  <span className="x">{m.t}</span>
                </li>
              ))}
            </ol>
          )}
        </div>
      )}
    </div>
  );
}

/* ═══ Sur l'accueil : quand il y a du neuf, ou un geste à faire ═══
   (La signature a déjà sa carte, « Un document vous attend » : pas de doublon.) */
export function offreAAccueil(o: OffreEspace | null | undefined, maintenant = Date.now()): number {
  if (!o) return 0;
  const recent = (iso: string | null, jours: number) => !!iso && maintenant - Date.parse(iso) < jours * 86_400_000;
  if (o.etat === 'contre' && !o.enPreparation) return o.contre?.depassee ? (recent(o.reponseLe, 7) ? 2 : 0) : 4;
  if (o.etat === 'acceptee' && recent(o.reponseLe, 30)) return 3;
  if ((o.etat === 'refusee' && recent(o.reponseLe, 7)) || (o.etat === 'echue' && recent(o.fin, 7))) return 2;
  if (o.etat === 'envoyee' && recent(o.envoyeLe, 3)) return 1;
  return 0;
}
export function CarteOffreAccueil({ bien, o, onOuvrir, onVoir, indispo = false, ...actions }: {
  bien: BienOffre; o: OffreEspace; onOuvrir: () => void; onVoir: () => void; indispo?: boolean;
  onAccepter?: () => void; onAutre?: () => void; onNouvelle?: () => void; onSansSuite?: () => Promise<boolean>;
}) {
  return (
    <section className={'vv-acc ofr-acc' + (o.etat === 'acceptee' ? ' fete' : o.etat === 'contre' ? ' contre' : '')}>
      <div className="vv-acc-t">{o.etat === 'acceptee' ? <Fete t={14} /> : <Ic n="euro" t={14} />}<span>Votre offre</span></div>
      <div className="vv-acc-c">
        <button type="button" className="vv-haut" onClick={onOuvrir}>
          <span className="vv-ph">{bien.photo ? <img src={bien.photo} alt="" /> : <Ic n="maison" t={20} />}</span>
          <span className="vv-t">
            <b className="vv-prix">{bien.titre}</b>
            <span className="vv-meta">{bien.meta}</span>
          </span>
        </button>
        <CarteOffre o={o} indispo={indispo} {...actions} />
        <button type="button" className="vv-retour" onClick={onVoir}>Voir toutes mes visites</button>
      </div>
    </section>
  );
}

/* ═══ Les styles ═══ */
export const CSS_OFFRE = `
.etiq.gris{background:var(--fond); color:var(--plume); border-color:var(--trait)}
.etiq.offre{background:var(--or-fond); color:var(--or-fonce); border-color:var(--or-trait)}
.ofr-bien{display:flex; gap:12px; align-items:center; padding:10px; border-radius:16px; background:var(--fond); border:1px solid var(--trait)}
.ofr-ph{width:64px; height:52px; border-radius:10px; overflow:hidden; flex:0 0 auto; background:var(--carte); display:flex; align-items:center; justify-content:center; color:var(--plume-clair)}
.ofr-ph img{width:100%; height:100%; object-fit:cover; display:block}
.ofr-bt{flex:1; min-width:0; display:flex; flex-direction:column; gap:1px}
.ofr-bt b{font-size:14.5px; color:var(--encre); line-height:1.3}
.ofr-bt > span{font-size:12.5px; color:var(--plume); line-height:1.4}
.ofr-bt .ofr-aff{color:var(--encre2); font-weight:700}
.ofr-avant{display:flex; flex-wrap:wrap; gap:6px 16px; font-size:13px; font-weight:700; color:var(--encre2)}
.ofr-avant > span{display:inline-flex; align-items:center; gap:7px}
.ofr-avant .pt{width:9px; height:9px; border-radius:50%; flex:0 0 auto}
.pt.or{background:var(--or)} .pt.violet{background:var(--prune)}
.ofr-saisie{display:flex; flex-direction:column; gap:6px}
.ofr-saisie .l{font-size:12px; font-weight:800; color:var(--plume); letter-spacing:.2px}
.ofr-saisie .e{font-size:12.5px; color:var(--brique); font-weight:600}
.ofr-eu{position:relative; display:block}
.ofr-eu input{width:100%; min-width:0; border:1.5px solid var(--trait); border-radius:13px; padding:12px 34px 12px 13px;
  font:inherit; font-size:15px; color:var(--encre); background:#fff; outline:none; -webkit-appearance:none; appearance:none; font-variant-numeric:tabular-nums}
.ofr-eu input:focus{border-color:var(--or)}
.ofr-eu i{position:absolute; right:13px; top:0; bottom:0; display:flex; align-items:center; font-style:normal; font-weight:800; color:var(--plume)}
.ofr-eu.grand input{font-size:28px; font-weight:800; padding:14px 46px 14px 16px; border-radius:16px; border-width:2px; letter-spacing:-.3px}
.ofr-eu.grand i{right:18px; font-size:22px}
.ofr-eu.grand input::placeholder{color:var(--plume-clair); font-weight:700; font-size:22px}
.ofr-saisie.rouge input{border-color:var(--brique)}
.ofr-auprix{align-self:flex-start; display:inline-flex; align-items:center; gap:7px; padding:8px 12px; border-radius:99px;
  background:var(--or-fond); border:1px solid var(--or-trait); color:var(--or-fonce); font-size:13px; font-weight:800; text-align:left; line-height:1.35}
.ofr-auprix svg{flex:0 0 auto}
.ofr-calc{border:1px solid var(--trait); border-radius:18px; padding:6px 16px 12px; background:var(--carte); box-shadow:var(--ombre)}
.ofr-calc[data-vide] b{color:var(--plume-clair)}
.ofr-l{display:flex; align-items:baseline; justify-content:space-between; gap:12px; padding:9px 0; border-bottom:1px dashed var(--trait)}
.ofr-l span{font-size:13.5px; color:var(--plume); font-weight:600}
.ofr-l b{font-size:15.5px; color:var(--encre); font-weight:800; white-space:nowrap}
.ofr-l.tot{border-bottom:none; padding-top:11px}
.ofr-l.tot span{color:var(--encre); font-weight:800}
.ofr-l.tot b{font-size:20px; color:var(--or-fonce)}
.ofr-gain{display:inline-flex; align-items:center; gap:6px; margin-top:4px; padding:6px 11px; border-radius:99px; background:#E7F6EE; color:#0E6B43;
  font-size:12.5px; font-weight:800; line-height:1.35}
.ofr-gain svg{flex:0 0 auto}
.ofr-gain.neutre{background:var(--fond); color:var(--plume); border:1px solid var(--trait)}
.ofr-q{display:inline-flex; align-items:center; justify-content:center; width:18px; height:18px; margin-left:6px; border-radius:50%; vertical-align:1px;
  border:1px solid var(--trait-fort); background:var(--carte); color:var(--plume); font:800 11px/1 'Plus Jakarta Sans',sans-serif; cursor:pointer; padding:0; flex:0 0 auto}
.ofr-q[aria-expanded="true"]{background:var(--marque); border-color:var(--marque); color:#fff}
.ofr-expl{margin:0 0 6px; padding:9px 11px; border-radius:10px; background:var(--fond); border:1px solid var(--trait); font-size:12.5px; line-height:1.55;
  color:var(--encre2); font-weight:500; letter-spacing:0; text-transform:none}
.ofr-expl.ofr-expl-b{display:block; margin:7px 0 4px}
.ofr-ex-t{display:inline}
.ofr-rassure{display:flex; gap:10px; align-items:flex-start; padding:12px 14px; border-radius:14px; background:var(--bleu-fond);
  border:1px solid var(--bleu-trait); color:var(--encre); font-size:13.5px; line-height:1.5; font-weight:600; text-align:left}
.ofr-rassure > svg{flex:0 0 auto; color:var(--bleu); margin-top:1px}
.ofr-rassure.serre{padding:9px 11px; font-size:12.5px; margin-top:10px; border-radius:12px}
.mdt-fini .ofr-rassure{max-width:400px}
.ofr-acq + .ofr-acq{border-top:1px solid var(--trait)}
.ofr-acq .mdt-qui-l{border-top:none}
.ofr-acq .mdt-perso{margin:0 10px 12px}
.ofr-manque{color:var(--or-fonce) !important; font-weight:700}
.ofr-mod{font-size:12.5px; font-weight:700; color:var(--or-fonce); text-decoration:underline; text-underline-offset:3px; padding:2px 0; background:none; border:none; font-family:inherit; cursor:pointer}
.ofr-date{border:1.5px solid var(--trait); border-radius:11px; padding:8px 10px; font:inherit; font-size:14px; color:var(--encre); background:#fff; margin-top:4px}
.ofr-chemins{display:flex; flex-direction:column; gap:10px; margin-top:4px}
.ofr-chemin{display:flex; align-items:center; gap:12px; width:100%; text-align:left; padding:14px; border-radius:18px;
  border:1.5px solid var(--trait-fort); background:var(--carte); color:var(--encre); cursor:pointer; font-family:inherit}
.ofr-chemin .ic{flex:0 0 auto; width:42px; height:42px; border-radius:13px; display:flex; align-items:center; justify-content:center;
  background:var(--bleu-fond); color:var(--bleu)}
.ofr-chemin .tx{flex:1; min-width:0; display:flex; flex-direction:column; gap:3px}
.ofr-chemin .tx b{font-size:15.5px; font-weight:800}
.ofr-chemin .tx span{font-size:12.5px; line-height:1.45; color:var(--plume)}
.ofr-chemin .ofr-fl{flex:0 0 auto; display:flex; transform:rotate(180deg); color:var(--plume)}
.ofr-chemin.or{background:var(--or); border-color:var(--or); color:#fff; box-shadow:0 12px 24px -12px var(--or)}
.ofr-chemin.or .ic{background:rgba(255,255,255,.2); color:#fff}
.ofr-chemin.or .tx span, .ofr-chemin.or .ofr-fl{color:rgba(255,255,255,.9)}
.ofr-chemin:disabled{opacity:.7; cursor:default}
.ofr-chemin.or .tourne{border-color:rgba(255,255,255,.35); border-top-color:#fff}

.ofr-c{margin-top:11px; padding:12px 13px; border-radius:14px; background:var(--fond); border:1px solid var(--trait); border-left:3px solid var(--or)}
.ofr-c.t-bleu{border-left-color:var(--bleu)} .ofr-c.t-vert{border-left-color:var(--vert); background:var(--vert-fond)}
.ofr-c.t-rouge{border-left-color:var(--brique)} .ofr-c.t-violet{border-left-color:var(--prune)} .ofr-c.t-gris{border-left-color:var(--trait-fort)}
.ofr-c-t{display:flex; align-items:center; gap:7px; flex-wrap:wrap}
.ofr-c-t .etiq svg{flex:0 0 auto}
.ofr-rang{font-size:11px; font-weight:800; color:var(--plume); letter-spacing:.3px}
.ofr-c-m{margin-left:auto; display:flex; flex-direction:column; align-items:flex-end; line-height:1.15}
.ofr-c-m small{font-size:10.5px; font-weight:800; letter-spacing:.4px; color:var(--plume)}
.ofr-c-m b{font-size:16px; font-weight:800; color:var(--encre); white-space:nowrap}
.ofr-c-p{margin:8px 0 0; font-size:13px; line-height:1.55; color:var(--encre2)}
.ofr-c-s{margin:6px 0 0; font-size:12px; font-weight:700; color:var(--plume)}
.ofr-contre{margin-top:10px; padding:11px 13px; border-radius:12px; background:var(--prune-fond); border:1px solid var(--prune-trait)}
.ofr-contre .t{font-size:10.5px; letter-spacing:1.2px; text-transform:uppercase; font-weight:800; color:var(--prune)}
.ofr-contre .v{margin-top:3px; font-size:22px; font-weight:800; color:var(--encre); line-height:1.15}
.ofr-contre .d{margin-top:3px; font-size:12.5px; color:var(--plume); line-height:1.45}
.ofr-fete{display:flex; gap:12px; align-items:flex-start; margin-top:10px; padding:12px 13px; border-radius:12px;
  background:linear-gradient(135deg, #E7F6EE 0%, #FFF6EC 100%); border:1px solid var(--vert-trait)}
.ofr-fete .ic{flex:0 0 auto; width:44px; height:44px; border-radius:50%; display:flex; align-items:center; justify-content:center; background:var(--vert); color:#fff;
  animation:ofrFete .7s cubic-bezier(.16,1,.3,1) both}
@keyframes ofrFete{0%{transform:scale(.4) rotate(-20deg); opacity:0} 70%{transform:scale(1.08) rotate(6deg); opacity:1} 100%{transform:none}}
.ofr-fete .tx{display:flex; flex-direction:column; gap:3px; min-width:0}
.ofr-fete .tx b{font-size:15.5px; color:#0E6B43}
.ofr-fete .tx span{font-size:13px; line-height:1.5; color:var(--encre2)}
.ofr-b{margin-top:10px; padding:12px 16px}
.ofr-b svg{flex:0 0 auto}
.ofr-acts{display:flex; flex-direction:column; gap:0}
.ofr-acts.deux{display:grid; grid-template-columns:1fr 1fr; gap:8px}
.ofr-acts .ofr-ns{align-self:center; margin-top:2px; text-decoration:underline; text-underline-offset:3px}
.ofr-conf{margin-top:10px; padding:12px; border-radius:12px; background:var(--carte); border:1px solid var(--trait); display:flex; flex-direction:column; gap:4px}
.ofr-conf b{font-size:14px; color:var(--encre)}
.ofr-conf > span{font-size:12.5px; line-height:1.5; color:var(--plume)}
.ofr-conf .ofr-rate{color:var(--brique); font-weight:600}
.ofr-h{margin-top:10px; border-top:1px solid var(--trait); padding-top:4px}
.ofr-h-b{display:flex; align-items:center; gap:6px; width:100%; background:none; border:none; padding:6px 0; font:inherit;
  font-size:12.5px; font-weight:800; color:var(--plume); cursor:pointer; text-align:left}
.ofr-h-b .cv{display:flex; transition:transform .18s ease}
.ofr-h.ouvert .ofr-h-b .cv{transform:rotate(180deg)}
.ofr-h-l{list-style:none; margin:4px 0 2px; padding:0 0 0 2px; position:relative}
.ofr-h-l li{position:relative; display:grid; grid-template-columns:14px 62px 1fr; gap:8px; align-items:start; padding:5px 0}
.ofr-h-l li::before{content:''; position:absolute; left:4.5px; top:21px; bottom:-8px; width:1.5px; background:var(--trait-fort)}
.ofr-h-l li:last-child::before{display:none}
.ofr-h-l li i{width:10px; height:10px; border-radius:50%; background:var(--or); margin-top:4px; position:relative}
.ofr-h-l li.t-bleu i{background:var(--bleu)} .ofr-h-l li.t-vert i{background:var(--vert)} .ofr-h-l li.t-rouge i{background:var(--brique)}
.ofr-h-l li.t-violet i{background:var(--prune)} .ofr-h-l li.t-gris i{background:var(--plume-clair)}
.ofr-h-l .q{font-size:11.5px; font-weight:800; color:var(--plume); white-space:nowrap}
.ofr-h-l .x{font-size:12.5px; line-height:1.45; color:var(--encre2)}
.vv-compte.c-vert{border-top-color:var(--vert)} .vv-compte.c-vert b{color:var(--vert)}
.vv-comptes.cinq{grid-template-columns:repeat(5,1fr); gap:6px}
@media(max-width:420px){ .vv-comptes.cinq .vv-compte{padding:9px 2px 8px} .vv-comptes.cinq .vv-compte b{font-size:19px} .vv-comptes.cinq .vv-compte span{font-size:10.5px} }
@media(max-width:359px){ .vv-comptes.cinq{grid-template-columns:repeat(3,1fr)} }
.ofr-acc.contre{border-color:var(--prune-trait)}
.ofr-acc.contre .vv-acc-t{background:var(--prune-fond); color:var(--prune)}
.ofr-acc.fete{border-color:var(--vert-trait)}
.ofr-acc.fete .vv-acc-t{background:var(--vert-fond); color:var(--vert)}
.ofr-acc .vv-acc-t svg{flex:0 0 auto}
.ofr-faire{display:flex; flex-direction:column; gap:8px; margin-top:10px}
.ofr-faire .btn{padding:13px 16px}
.ofr-mini{display:inline-flex; align-items:center; gap:7px; margin-top:10px; padding:8px 13px; border-radius:99px; border:1px solid var(--or-trait);
  background:var(--or-fond); color:var(--or-fonce); font-size:13px; font-weight:800; cursor:pointer; font-family:inherit}
.ofr-mini svg{flex:0 0 auto}
@media(min-width:640px){
  .ofr-chemins{flex-direction:row}
  .ofr-chemins > .ofr-chemin{flex:1 1 0; align-items:flex-start}
  .ofr-acts{flex-direction:row; flex-wrap:wrap; align-items:center; gap:8px}
  .ofr-acts .btn{width:auto}
  .ofr-acts .ofr-ns{margin-top:10px}
  .ofr-c .ofr-b{width:auto}
}
`;
