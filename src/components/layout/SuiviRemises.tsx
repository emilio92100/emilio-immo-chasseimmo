'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { supabase } from '@/lib/supabase';
import { EVT_REMISE, attendreRemises, lireRemises, remisesDe, type DemandeSuivi, type EtatRemiseClient, type RemiseClient } from '@/lib/remise-client';
import s from './SuiviRemises.module.css';

/* ═══ « Le mail est-il arrivé ? » en bas de l'écran (V3.151) ═════════════
   Alexandre : « un spinner qui permet de voir si ça a bien été envoyé, et
   sinon un message rouge, et que ça reste sur la même page ».

   Chaque réponse d'une route d'envoi qui porte `remise` (les mails partis,
   src/lib/remise-mail.ts) ouvre une carte, quelle que soit la page : on
   n'a rien eu à changer aux écrans qui envoient (fiche client, rappel de
   visite, nouveau mail, documents, mandat…). La carte :
     · « Vérification de la remise… » pendant que la messagerie répond ;
     · « Bien arrivé » en vert, qui s'efface seul ;
     · « Non distribué » en rouge, avec la raison (adresse inconnue, boîte
       pleine…), qui reste jusqu'à ce qu'on la ferme — et le Suivi du contact
       le note ;
     · au bout de 20 s sans réponse : « Parti, sa messagerie n'a pas encore
       répondu », qui s'efface, la vérification continuant toutes les 30 s
       pendant 10 minutes : un refus tardif rouvre la carte en rouge.
   Les réponses sont lues sur le chemin de `fetch` (une copie, sans rien
   retarder). Un écran qui suit lui-même ses envois (« Envoyer ce bien »)
   le dit par l'en-tête `x-remise-suivie` (REMISE_SUIVIE). */

type Suivi = {
  cle: string; remises: RemiseClient[]; etats: Record<string, EtatRemiseClient>;
  phase: 'verif' | 'fini' | 'tard'; visible: boolean; discret: boolean; sortie?: boolean;
};
const ROUTES = /^\/api\//;
const TARD_MS = 20_000;
const SUITE_MS = 30_000;
const SUITE_MAX_MS = 10 * 60_000;

const nomDe = (r: RemiseClient) => r.nom?.trim() || r.email;

export default function SuiviRemises({ onFiche }: { onFiche: (client: Record<string, unknown>) => void }) {
  const [suivis, setSuivis] = useState<Suivi[]>([]);
  const vivant = useRef(true);
  useEffect(() => { vivant.current = true; return () => { vivant.current = false; }; }, []);

  const maj = useCallback((cle: string, f: (x: Suivi) => Suivi) => {
    if (vivant.current) setSuivis(l => l.map(x => (x.cle === cle ? f(x) : x)));
  }, []);
  const retirer = useCallback((cle: string) => {
    maj(cle, x => ({ ...x, sortie: true }));
    window.setTimeout(() => { if (vivant.current) setSuivis(l => l.filter(x => x.cle !== cle)); }, 220);
  }, [maj]);

  const suivre = useCallback(async (d: DemandeSuivi) => {
    const cle = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const remises = d.remises.slice(0, 40);
    const nouveau: Suivi = { cle, remises, etats: {}, phase: 'verif', visible: !d.discret, discret: !!d.discret };
    setSuivis(l => [...l, nouveau].slice(-4));
    const fusion = (m: Map<string, EtatRemiseClient>) => maj(cle, x => ({ ...x, etats: { ...x.etats, ...Object.fromEntries(m) } }));
    const premiers = await attendreRemises(remises, TARD_MS, fusion);
    const refus = remises.some(r => premiers.get(r.id)?.etat === 'refuse');
    const restent = remises.filter(r => (premiers.get(r.id)?.etat || 'attente') === 'attente');
    if (refus) { maj(cle, x => ({ ...x, phase: 'fini', visible: true })); return; }
    if (!restent.length) {
      maj(cle, x => ({ ...x, phase: 'fini' }));
      window.setTimeout(() => retirer(cle), d.discret ? 0 : 6_000);
      return;
    }
    /* Pas encore de réponse : on le dit, puis on vérifie en silence. */
    maj(cle, x => ({ ...x, phase: 'tard' }));
    window.setTimeout(() => maj(cle, x => (x.phase === 'tard' ? { ...x, visible: false } : x)), 9_000);
    const debut = Date.now();
    let reste = restent;
    while (reste.length && Date.now() - debut < SUITE_MAX_MS && vivant.current) {
      await new Promise(ok => setTimeout(ok, SUITE_MS));
      try {
        const etats = await lireRemises(reste);
        fusion(new Map(etats.map(e => [e.id, e])));
        if (etats.some(e => e.etat === 'refuse')) { maj(cle, x => ({ ...x, phase: 'fini', visible: true })); return; }
        reste = reste.filter(r => (etats.find(e => e.id === r.id)?.etat || 'attente') === 'attente');
      } catch { /* au tour suivant */ }
    }
    retirer(cle);
  }, [maj, retirer]);

  /* Les réponses des routes d'envoi, lues au passage. */
  useEffect(() => {
    const w = window as typeof window & { __emiRemises?: boolean };
    const recevoir = (e: Event) => { const d = (e as CustomEvent<DemandeSuivi>).detail; if (d?.remises?.length) void suivre(d); };
    window.addEventListener(EVT_REMISE, recevoir);
    if (w.__emiRemises) return () => window.removeEventListener(EVT_REMISE, recevoir);
    w.__emiRemises = true;
    const avant = window.fetch;
    const enveloppe: typeof window.fetch = async (input, init) => {
      const r = await avant(input, init);
      try {
        const u = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
        const chemin = new URL(u, window.location.href).pathname;
        const h = new Headers(init?.headers || (input instanceof Request ? input.headers : undefined));
        if (ROUTES.test(chemin) && chemin !== '/api/mail/remise' && !h.has('x-remise-suivie') && (r.headers.get('content-type') || '').includes('json')) {
          r.clone().json().then(j => {
            const l = remisesDe(j);
            if (l.length) window.dispatchEvent(new CustomEvent<DemandeSuivi>(EVT_REMISE, { detail: { remises: l } }));
          }).catch(() => {});
        }
      } catch { /* la réponse passe telle quelle */ }
      return r;
    };
    window.fetch = enveloppe;
    return () => {
      window.removeEventListener(EVT_REMISE, recevoir);
      if (window.fetch === enveloppe) { window.fetch = avant; w.__emiRemises = false; }
    };
  }, [suivre]);

  async function ouvrirFiche(id: string) {
    const { data } = await supabase.from('clients').select('*').eq('id', id).maybeSingle();
    if (data) onFiche(data as Record<string, unknown>);
  }

  const vus = suivis.filter(x => x.visible);
  if (!vus.length || typeof document === 'undefined') return null;
  return createPortal(
    <div className={s.pile}>
      {vus.map(x => {
        const refuses = x.remises.filter(r => x.etats[r.id]?.etat === 'refuse');
        const remis = x.remises.filter(r => x.etats[r.id]?.etat === 'remis');
        const ton = refuses.length ? 'rouge' : x.phase === 'verif' ? 'verif' : x.phase === 'tard' ? 'ambre' : 'vert';
        const un = x.remises.length === 1;
        const objet = x.remises.find(r => r.objet)?.objet || '';
        const titre = ton === 'rouge' ? (refuses.length > 1 ? `${refuses.length} mails non distribués` : 'Mail non distribué')
          : un ? `Mail à ${nomDe(x.remises[0])}` : `${x.remises.length} mails`;
        const etat = ton === 'verif' ? (remis.length && !un ? `Vérification de la remise… ${remis.length} sur ${x.remises.length} arrivés` : 'Vérification de la remise…')
          : ton === 'vert' ? (un ? 'Bien arrivé dans sa boîte mail' : 'Tous bien arrivés')
            : ton === 'ambre' ? 'Parti. Sa messagerie n’a pas encore répondu : je continue de vérifier, un refus s’afficherait ici.'
              : remis.length ? `${remis.length > 1 ? `Les ${remis.length} autres sont bien arrivés` : 'L’autre est bien arrivé'}. C’est noté dans son historique.` : 'C’est noté dans son historique. Vérifie l’adresse avant de le renvoyer.';
        const clientRouge = refuses.find(r => r.clientId)?.clientId;
        return (
          <div key={x.cle} className={s.carte} data-ton={ton} data-sortie={x.sortie ? 'oui' : undefined} role={ton === 'rouge' ? 'alert' : 'status'} aria-live={ton === 'rouge' ? 'assertive' : 'polite'}>
            <span className={s.rond} aria-hidden="true">
              {ton === 'verif' ? <i className={s.roue} />
                : ton === 'vert' ? <svg viewBox="0 0 24 24" width="17" height="17"><path className={s.trait} d="m5 12.5 4.5 4.5L19 7.5" /></svg>
                  : ton === 'ambre' ? <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round"><circle cx="12" cy="12" r="8.5" /><path d="M12 7.5V12l3 2" /></svg>
                    : <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2.8" strokeLinecap="round"><path d="M17 7 7 17M7 7l10 10" /></svg>}
            </span>
            <div className={s.tx}>
              <b>{titre}</b>
              {objet && ton !== 'rouge' && <small className={s.objet}>{objet}</small>}
              {ton === 'rouge' && (
                <ul className={s.refus}>
                  {refuses.map(r => <li key={r.id}><span>{nomDe(r) === r.email ? r.email : `${nomDe(r)} · ${r.email}`}</span><em>{x.etats[r.id]?.raison || 'refusé'}</em></li>)}
                </ul>
              )}
              <span className={s.etat}>{etat}</span>
              {ton === 'rouge' && clientRouge && <button type="button" className={s.lien} onClick={() => { void ouvrirFiche(clientRouge); }}>Ouvrir sa fiche</button>}
            </div>
            <button type="button" className={s.fermer} aria-label="Fermer" onClick={() => retirer(x.cle)}>
              <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round"><path d="M17 7 7 17M7 7l10 10" /></svg>
            </button>
            {ton === 'verif' && <span className={s.barre} aria-hidden="true" />}
          </div>
        );
      })}
    </div>,
    document.body,
  );
}
