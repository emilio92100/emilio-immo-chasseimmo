'use client';
/* ═══ Le rapprochement, partout (V3.122 → V3.125) ══════════════════════════
   La route /api/rapprochement-ia relit des couples bien × recherche et rend
   pour chacun un avis : « Oui », « À voir » ou « Non », une phrase, ses plus,
   ses moins, et une note de potentiel sur 100 (V3.125). Trois endroits s'en
   servent, avec les mêmes morceaux, et le même procédé (Alexandre : « quand
   j'appuie, que le rapprochement fasse le travail ») — un bouton fait le
   premier tri en chiffres PUIS la relecture, et les résultats n'arrivent
   qu'ensuite :
     · l'onglet Rapprochement d'un bien (RapprochementBien) ;
     · « Envoyer » depuis la liste des biens (LotBiens, FenEnvoiLot) ;
     · le rapprochement de la fiche d'un acheteur, pour ses mandats
       (fiche/Rapprochement).
   Les avis sont gardés sur chaque bien (`biens_vente.rapprochement_ia`) :
   relancé, le rapprochement ne relit que ce qui a changé. À l'écran, on dit
   « le rapprochement », jamais « l'IA ». */

import type { ReactNode } from 'react';
import { IcoP } from '@/components/shared/Parcours';
import a from './RapprochementIA.module.css';

/* `s` : la note de potentiel ; `p`, `m` : les plus, les moins (V3.125 ;
   absents des avis d'avant, relus au prochain passage). */
export type AvisIA = { v: 'oui' | 'a_voir' | 'non'; r: string; le?: string; s?: number; p?: string[]; m?: string[] };
export type AvisParBien = Record<string, Record<string, AvisIA>>;
export type Paire = { b: string; r: string };

export const ORDRE_IA: Record<AvisIA['v'], number> = { oui: 0, a_voir: 1, non: 3 };
export const MOT_IA: Record<AvisIA['v'], string> = { oui: 'Oui', a_voir: 'À voir', non: 'Non' };
export const COULEUR_IA: Record<AvisIA['v'], string> = { oui: '#16a34a', a_voir: '#d97706', non: '#dc2626' };
export const ETINCELLE = 'M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8zM19 15l.8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8z';
const COCHE = 'm5 12.5 4.5 4.5L19 7.5';
/* La ponctuation française ne passe jamais seule à la ligne : une espace
   insécable avant « : ; ? ! » et à l'intérieur des guillemets. */
export const fr = (t: string) => t.replace(/ ([:;?!»])/g, '\u00a0$1').replace(/« /g, '«\u00a0');
const TIRET = 'M6 12h12';
const POUCE = 'M7 11v9H4v-9zM7 11l4-7a2 2 0 0 1 3 2l-1 4h5.5a2 2 0 0 1 2 2.4l-1.3 6A2 2 0 0 1 17.2 20H7';
const ATTENTION = 'M12 4 2.5 20h19zM12 10v4.5M12 17.5v.01';
const CROIX = 'M7 7l10 10M17 7 7 17';
const LOUPE = 'M10.5 4a6.5 6.5 0 1 0 0 13a6.5 6.5 0 1 0 0-13zM15.5 15.5 20 20';
/* L'icône de chaque avis, pour les titres des groupes. */
export const ICONE_IA: Record<AvisIA['v'], string> = { oui: COCHE, a_voir: LOUPE, non: CROIX };
export function IconeAvis({ v, t = 26 }: { v: AvisIA['v']; t?: number }) {
  return <span className={a.icAvis} data-v={v} style={{ width: t, height: t }}><IcoP d={ICONE_IA[v]} t={Math.round(t * 0.55)} e={2.8} /></span>;
}
/* Le rang d'un avis pour trier (sans avis : entre « à voir » et « non »). */
export const rangIA = (x?: AvisIA | null) => (x ? ORDRE_IA[x.v] : 2);
/* Pour trier : l'avis d'abord, puis la note de potentiel. */
export const compareIA = (x?: AvisIA | null, y?: AvisIA | null) => rangIA(x) - rangIA(y) || (y?.s ?? -1) - (x?.s ?? -1);

/* Par appel : de quoi répondre bien avant la minute de Vercel ; trois appels
   à la fois, pour ne pas faire attendre. */
const PAR_APPEL = 8;
const EN_MEME_TEMPS = 3;
const valide = (x: unknown): x is AvisIA => !!x && typeof x === 'object' && ['oui', 'a_voir', 'non'].includes(String((x as AvisIA).v));

/* Relit les couples, par paquets. `onAvis` reçoit tout ce qui est connu
   après chaque paquet, et combien de couples sont faits. Un paquet qui
   échoue n'arrête pas les autres : `manquent` dit combien restent à relire. */
export async function analyserIA(paires: Paire[], onAvis: (avis: AvisParBien, fait: number) => void): Promise<{ erreur: string; info: string; manquent: number }> {
  const vues = paires.filter((p, i, l) => l.findIndex(q => q.b === p.b && q.r === p.r) === i);
  /* Un bien à la fois autant que possible : moins de fiches à relire par appel. */
  vues.sort((p, q) => p.b.localeCompare(q.b));
  const lots: Paire[][] = [];
  for (let i = 0; i < vues.length; i += PAR_APPEL) lots.push(vues.slice(i, i + PAR_APPEL));
  let cumul: AvisParBien = {};
  let fait = 0, info = '', erreur = '', manquent = 0, suivant = 0;
  async function ouvrier() {
    while (suivant < lots.length) {
      const lot = lots[suivant++];
      try {
        const res = await fetch('/api/rapprochement-ia', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ paires: lot.map(p => ({ bien_id: p.b, recherche_id: p.r })) }),
        });
        const j = await res.json().catch(() => ({})) as { ok?: boolean; erreur?: string; avis?: AvisParBien; avertissement?: string };
        if (!res.ok || !j.ok) throw new Error(j.erreur || `erreur ${res.status}`);
        for (const [b, x] of Object.entries(j.avis || {})) {
          const bons = Object.fromEntries(Object.entries(x).filter(([, y]) => valide(y)));
          cumul = { ...cumul, [b]: { ...(cumul[b] || {}), ...bons } };
        }
        if (j.avertissement) info = j.avertissement;
      } catch (e) {
        if (!erreur) erreur = (e as Error).message || 'erreur';
      }
      fait += lot.length;
      onAvis(cumul, fait);
    }
  }
  await Promise.all(Array.from({ length: Math.min(EN_MEME_TEMPS, lots.length) }, ouvrier));
  for (const p of vues) if (!cumul[p.b]?.[p.r]) manquent++;
  return { erreur: manquent ? erreur : '', info, manquent };
}

/* ── L'avatar (ou la photo du bien), et la note juste en dessous ──
   V3.125, Alexandre : « mettre les avatars pour chaque contact… et le score,
   juste en bas de l'avatar ». Que des <span> : il se pose dans un bouton. */
export function AvecScore({ children, s, v, forme = 'rond', legende = 'potentiel' }: {
  children: ReactNode; s?: number | null; v?: AvisIA['v'] | null; forme?: 'rond' | 'carre'; legende?: string;
}) {
  const n = typeof s === 'number' ? Math.max(0, Math.min(100, Math.round(s))) : null;
  return (
    <span className={a.avs} data-v={v || 'aucun'} data-forme={forme} title={n !== null ? `${legende === 'potentiel' ? 'Potentiel' : legende} : ${n} sur 100` : undefined}>
      <span className={a.avsAv}>{children}</span>
      {n !== null && <span className={a.avsNote}><b>{n}</b><small>{'/100'}</small></span>}
      {n !== null && <small className={a.avsLeg}>{legende}</small>}
    </span>
  );
}

/* ── Ce que dit le rapprochement : la phrase, puis les plus et les moins ──
   Que des <span> : il se pose aussi dans un bouton (la fiche d'un acheteur).
   `sansMot` : dans un groupe « Oui », le mot « Oui » n'apprend rien.
   `avant` : le bien dont il parle, quand la ligne en porte plusieurs.
   `compact` : les plus et les moins en pastilles, sur une ligne. */
export function AvisDetail({ avis, sansMot, avant, compact }: { avis: AvisIA; sansMot?: boolean; avant?: string; compact?: boolean }) {
  const p = avis.p || [], m = avis.m || [];
  return (
    <span className={`${a.avis} ${compact ? a.avisCompact : ''}`} data-v={avis.v}>
      <span className={a.l1}>
        {sansMot ? <span className={a.etin}><IcoP d={ETINCELLE} t={13} e={2} /></span> : <b className={a.mot}><IcoP d={ETINCELLE} t={12} e={2} />{MOT_IA[avis.v]}</b>}
        <span className={a.phrase}>{avant ? <i className={a.avant}>{`${avant} · `}</i> : null}{fr(avis.r)}</span>
      </span>
      {(p.length > 0 || m.length > 0) && (compact ? (
        <span className={a.puces}>
          {p.map(t => <span key={`p${t}`} className={a.pPlus}><IcoP d={COCHE} t={11} e={3} />{fr(t)}</span>)}
          {m.map(t => <span key={`m${t}`} className={a.pMoins}><IcoP d={TIRET} t={11} e={3} />{fr(t)}</span>)}
        </span>
      ) : (
        <span className={a.pm}>
          <span className={a.col} data-k="plus">
            <i className={a.colT}><IcoP d={POUCE} t={12} e={2.4} />{'Les plus'}</i>
            {p.length ? p.map(t => <span key={t} className={a.pt}><IcoP d={COCHE} t={12} e={3} /><span>{fr(t)}</span></span>) : <span className={a.rien}>{'Aucun en particulier'}</span>}
          </span>
          <span className={a.col} data-k="moins">
            <i className={a.colT}><IcoP d={ATTENTION} t={12} e={2.4} />{'Les moins'}</i>
            {m.length ? m.map(t => <span key={t} className={a.pt}><IcoP d={TIRET} t={12} e={3} /><span>{fr(t)}</span></span>) : <span className={a.rien}>{'Rien à signaler'}</span>}
          </span>
        </span>
      ))}
    </span>
  );
}

/* ── Le rapprochement en cours : les étapes, et où il en est ── */
export type EtapeProg = { t: string; d: string; etat: 'fait' | 'en' | 'attente'; fait?: number; total?: number };
export function Progression({ etapes, titre = 'Rapprochement en cours…' }: { etapes: EtapeProg[]; titre?: string }) {
  return (
    <div className={a.prog} role="status" aria-live="polite">
      <div className={a.progT}>
        <span className={a.progIc}><span className={a.tourne} aria-hidden="true" /></span>
        <b>{titre}</b>
      </div>
      <ol className={a.progL}>
        {etapes.map((e, i) => (
          <li key={i} data-etat={e.etat}>
            <span className={a.progPuce}>{e.etat === 'fait' ? <IcoP d={COCHE} t={13} e={3.2} /> : e.etat === 'en' ? <span className={a.tournePetit} aria-hidden="true" /> : <i>{i + 1}</i>}</span>
            <span className={a.progTx}>
              <b>{e.t}</b>
              <span>{fr(e.d)}</span>
              {e.etat === 'en' && !!e.total && (
                <span className={a.barre}><i style={{ width: `${Math.max(6, Math.min(100, ((e.fait || 0) / e.total) * 100))}%` }} /></span>
              )}
            </span>
          </li>
        ))}
      </ol>
    </div>
  );
}

/* « jeudi 8 octobre à 14 h 32 » (et l'année quand ce n'est pas celle-ci). */
export function dateRappro(iso: string): string {
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return '';
  const memeAnnee = d.getFullYear() === new Date().getFullYear();
  const jour = d.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', ...(memeAnnee ? {} : { year: 'numeric' }), timeZone: 'Europe/Paris' });
  const [h, m] = d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Paris' }).split(':');
  return `${jour} à ${Number(h)}\u00a0h\u00a0${m}`;
}
