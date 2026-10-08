'use client';
/* ═══ Le rapprochement intelligent, partout (V3.122 → V3.123) ══════════════
   L'IA relit des couples bien × recherche (route /api/rapprochement-ia) et
   rend « Oui », « À voir » ou « Non » avec une phrase. Trois endroits s'en
   servent, avec les mêmes morceaux :
     · l'onglet Rapprochement d'un bien (RapprochementBien) ;
     · « Envoyer » depuis la liste des biens, après « Lancer le
       rapprochement » (LotBiens, FenEnvoiLot) ;
     · le rapprochement de la fiche d'un acheteur, pour ses mandats
       (fiche/Rapprochement).
   Les avis sont gardés sur chaque bien (`biens_vente.rapprochement_ia`) et,
   le temps de la session, ici (MEMOIRE) : un écran qui se remonte les
   retrouve sans relancer. */

import { IcoP } from '@/components/shared/Parcours';
import a from './RapprochementIA.module.css';

export type AvisIA = { v: 'oui' | 'a_voir' | 'non'; r: string; le: string };
export type AvisParBien = Record<string, Record<string, AvisIA>>;
export type Paire = { b: string; r: string };

export const ORDRE_IA: Record<AvisIA['v'], number> = { oui: 0, a_voir: 1, non: 3 };
export const MOT_IA: Record<AvisIA['v'], string> = { oui: 'Oui', a_voir: 'À voir', non: 'Non' };
export const ETINCELLE = 'M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8zM19 15l.8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8z';
/* Le rang d'un avis pour trier (sans avis : entre « à voir » et « non »). */
export const rangIA = (x?: AvisIA | null) => (x ? ORDRE_IA[x.v] : 2);

const PAR_APPEL = 12;
const MEMOIRE = new Map<string, Record<string, AvisIA>>();
const valide = (x: unknown): x is AvisIA => !!x && typeof x === 'object' && ['oui', 'a_voir', 'non'].includes(String((x as AvisIA).v));

/* Les avis connus pour ce bien : ceux de la session, sinon ceux gardés sur la fiche. */
export function avisDuBien(bien: { id: string } & Record<string, unknown>): Record<string, AvisIA> {
  const garde = MEMOIRE.get(bien.id) || (bien.rapprochement_ia as Record<string, AvisIA> | null | undefined) || {};
  return Object.fromEntries(Object.entries(garde).filter(([, x]) => valide(x)));
}
/* Les avis connus pour plusieurs biens d'un coup. */
export function avisDesBiens(biens: ({ id: string } & Record<string, unknown>)[]): AvisParBien {
  return Object.fromEntries(biens.map(b => [b.id, avisDuBien(b)]));
}

/* Relit les couples, par paquets (moins d'une minute chacun, la limite de
   Vercel). `onAvis` reçoit tout ce qui est connu après chaque paquet. */
export async function analyserIA(paires: Paire[], depart: AvisParBien, onAvis: (avis: AvisParBien, fait: number) => void): Promise<{ erreur: string; info: string }> {
  const vues = paires.filter((p, i, l) => l.findIndex(q => q.b === p.b && q.r === p.r) === i);
  /* Un bien à la fois autant que possible : moins de fiches à relire par appel. */
  vues.sort((p, q) => p.b.localeCompare(q.b));
  let cumul: AvisParBien = Object.fromEntries(Object.entries(depart).map(([b, x]) => [b, { ...x }]));
  let fait = 0, info = '';
  for (let i = 0; i < vues.length; i += PAR_APPEL) {
    const lot = vues.slice(i, i + PAR_APPEL);
    try {
      const res = await fetch('/api/rapprochement-ia', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ paires: lot.map(p => ({ bien_id: p.b, recherche_id: p.r })) }),
      });
      const j = await res.json().catch(() => ({})) as { ok?: boolean; erreur?: string; avis?: AvisParBien; avertissement?: string };
      if (!res.ok || !j.ok) throw new Error(j.erreur || `erreur ${res.status}`);
      for (const [b, x] of Object.entries(j.avis || {})) {
        cumul = { ...cumul, [b]: { ...(cumul[b] || {}), ...x } };
        MEMOIRE.set(b, { ...(MEMOIRE.get(b) || {}), ...x });
      }
      if (j.avertissement) info = j.avertissement;
      fait += lot.length;
      onAvis(cumul, fait);
    } catch (e) {
      return { erreur: (e as Error).message, info };
    }
  }
  return { erreur: '', info };
}

const ilYa = (iso: string) => {
  const j = Math.floor((Date.now() - Date.parse(iso)) / 86_400_000);
  return !Number.isFinite(j) ? '' : j <= 0 ? 'aujourd’hui' : j === 1 ? 'hier' : `il y a ${j} jours`;
};

/* L'avis sur une ligne : le mot, puis la phrase. Que des <span> : il se pose
   aussi dans un bouton (la ligne du rapprochement de la fiche). `avant` :
   le bien dont il parle, quand la ligne en porte plusieurs. */
export function AvisLigne({ avis, avant }: { avis: AvisIA; avant?: string }) {
  return (
    <span className={a.avis} data-v={avis.v}>
      <b className={a.mot}><IcoP d={ETINCELLE} t={12} e={2} />{MOT_IA[avis.v]}</b>
      <span>{avant ? <i className={a.avant}>{`${avant} · `}</i> : null}{avis.r}</span>
    </span>
  );
}

/* La carte : ce que fait l'analyse, où elle en est, ce qu'elle a trouvé. */
export function CarteIA({ total, avis, en, fait, erreur, info, onLancer, texteRepos, compact }: {
  total: number;
  /* Les avis des couples affichés (pour le compte). */
  avis: AvisIA[];
  en: boolean; fait: number; erreur: string; info: string;
  onLancer?: () => void;
  texteRepos: string;
  compact?: boolean;
}) {
  const n = (v: AvisIA['v']) => avis.filter(x => x.v === v).length;
  const dernier = avis.map(x => x.le).sort().pop() || '';
  return (
    <section className={`${a.carte} ${compact ? a.compact : ''}`} data-en={en ? 'oui' : undefined} aria-label="Rapprochement intelligent">
      <span className={a.ic}>{en ? <span className={a.tourne} aria-hidden="true" /> : <IcoP d={ETINCELLE} t={compact ? 17 : 20} e={1.9} />}</span>
      <div className={a.tx}>
        <b>{'Rapprochement intelligent'}</b>
        <span role="status">
          {en
            ? `L’IA relit les recherches, leurs comptes rendus et ${total > 1 ? 'les fiches' : 'la fiche'}… ${Math.min(fait, total)} sur ${total}`
            : avis.length
              ? `${avis.length} avis ${dernier ? ilYa(dernier) : ''} : ${n('oui')} oui · ${n('a_voir')} à voir · ${n('non')} non.${avis.length < total ? ` ${total - avis.length} pas encore.` : ''}`
              : texteRepos}
        </span>
        {erreur && <span className={a.erreur}>{erreur}</span>}
        {info && <span className={a.info}>{info}</span>}
      </div>
      {!en && onLancer && total > 0 && (
        <button type="button" className={avis.length ? a.btnDoux : a.btn} onClick={onLancer}
          title={avis.length ? 'Ne relit que ce qui est nouveau, ou ce qui a changé (le bien ou la recherche)' : undefined}>
          <IcoP d={ETINCELLE} t={15} e={2} />{avis.length ? (avis.length < total ? 'Relire les autres' : 'Mettre à jour') : 'Lancer l’analyse'}
        </button>
      )}
    </section>
  );
}
