'use client';
import { useEffect, useState, useCallback } from 'react';

/* ═══ Le point automatique, sur la fiche d'un client ════════════════════
   Le mail « Où en est votre recherche ? » part tout seul quand un dossier
   actif ne bouge plus (voir src/lib/point-auto.ts). Ici, on ne règle rien :
   on voit quand il partira, ce que le client a répondu les fois d'avant, et
   on peut l'exclure. Le réglage général vit dans les Paramètres.

   Tout est calculé côté serveur (/api/point-auto, mode « client ») avec la
   même règle que l'envoi quotidien : la fiche ne peut pas annoncer une date
   que l'envoi ne tiendrait pas. */

type Etat = {
  reglages: { actif: boolean; delai: number };
  branche: { cron: boolean; mailjet: boolean };
  client: {
    statut: string;
    dernierMouvement: string | null;
    dernierEnvoi: string | null;
    echeance: string;
    du: boolean;
    empechement: string | null;
    exclu: boolean;
    historique: { le: string; reponse: string | null; reponduLe: string | null }[];
  };
};

const jour = (iso: string, annee = false) => new Date(iso).toLocaleDateString('fr-FR', {
  day: 'numeric', month: 'long', ...(annee ? { year: 'numeric' } : {}), timeZone: 'Europe/Paris',
});

export default function PointAuto({ clientId }: { clientId: string }) {
  const [etat, setEtat] = useState<Etat | null>(null);
  const [erreur, setErreur] = useState('');
  const [enCours, setEnCours] = useState(false);
  const [ouvert, setOuvert] = useState(false);

  const charger = useCallback(async () => {
    try {
      const r = await fetch('/api/point-auto', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode: 'client', client_id: clientId }),
      });
      const j = await r.json();
      if (!j.ok) { setErreur(j.error || 'Lecture impossible'); return; }
      setErreur(''); setEtat(j);
    } catch { setErreur('Lecture impossible'); }
  }, [clientId]);

  useEffect(() => { charger(); }, [charger]);

  const exclu = !!etat?.client.exclu;

  async function basculer() {
    setEnCours(true);
    try {
      const r = await fetch('/api/point-auto', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode: 'exclure', client_id: clientId, exclu: !exclu }),
      });
      const j = await r.json();
      if (!j.ok) alert("Le réglage n'a pas pu être enregistré.\n\n" + (j.error || ''));
      await charger();
    } finally { setEnCours(false); }
  }

  if (erreur) return null;
  if (!etat) return null;

  const c = etat.client;
  const actifGeneral = etat.reglages.actif && etat.branche.cron;

  /* Une phrase, et une seule : ce qui va se passer. */
  let phrase: string; let sous: string | null = null; let ton: 'neutre' | 'or' | 'gris' = 'neutre';
  if (c.empechement) {
    phrase = c.empechement; ton = 'gris';
  } else if (!actifGeneral) {
    phrase = etat.reglages.actif ? 'Activé, mais l’envoi automatique n’est pas encore branché.' : 'Désactivé dans les Paramètres : rien ne part pour l’instant.';
    sous = `Sinon, il partirait le ${jour(c.echeance)} si rien ne bouge.`; ton = 'gris';
  } else if (c.du) {
    phrase = 'Part au prochain envoi, demain matin.'; ton = 'or';
  } else {
    phrase = `Prochain mail le ${jour(c.echeance)}, si rien ne bouge d’ici là.`;
  }
  const dernier = c.dernierMouvement ? `Dernier mouvement le ${jour(c.dernierMouvement, true)}` : 'Aucun mouvement depuis la création du dossier';

  return (
    <div style={{ background: 'white', border: '1px solid #e3e8f0', borderRadius: 14, padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <span style={{ width: 32, height: 32, borderRadius: 10, background: ton === 'or' ? '#fdf8ea' : '#f4f7fb', border: `1px solid ${ton === 'or' ? '#ecdcae' : '#e6ebf2'}`, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={ton === 'or' ? '#9a7d2e' : '#4a6b90'} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="5" width="18" height="14" rx="2" /><path d="m3.5 6.5 8.5 6 8.5-6" /></svg>
        </span>
        <span style={{ flex: '1 1 220px', minWidth: 0 }}>
          <span style={{ display: 'block', fontSize: 10, fontWeight: 800, letterSpacing: 1, textTransform: 'uppercase', color: '#94a3b8' }}>{'Mail « Où en est votre recherche ? »'}</span>
          <span style={{ display: 'block', fontSize: 13.5, fontWeight: 700, color: ton === 'gris' ? '#64748b' : ton === 'or' ? '#8a6d1f' : '#1a2332', marginTop: 2 }}>{phrase}</span>
          <span style={{ display: 'block', fontSize: 12, color: '#94a3b8', marginTop: 2 }}>{sous || dernier}</span>
        </span>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
          {c.historique.length > 0 && (
            <button type="button" onClick={() => setOuvert(v => !v)}
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#4a6b90', fontWeight: 700, fontSize: 12.5, fontFamily: 'inherit', padding: 0 }}>
              {ouvert ? 'Masquer' : `Historique (${c.historique.length})`}
            </button>
          )}
          <button type="button" onClick={basculer} disabled={enCours} role="switch" aria-checked={exclu}
            title={exclu ? 'Ce client ne recevra jamais ce mail — cliquer pour le réactiver' : 'Ne jamais envoyer ce mail à ce client'}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 7, background: 'none', border: 'none', cursor: enCours ? 'wait' : 'pointer', fontFamily: 'inherit', padding: 0, color: '#64748b', fontSize: 12.5, fontWeight: 600 }}>
            <span style={{ width: 32, height: 19, borderRadius: 99, background: exclu ? '#ef4444' : '#cbd5e1', position: 'relative', transition: 'background .15s', flexShrink: 0 }}>
              <span style={{ position: 'absolute', top: 2, left: exclu ? 15 : 2, width: 15, height: 15, borderRadius: '50%', background: 'white', transition: 'left .15s', boxShadow: '0 1px 2px rgba(0,0,0,.2)' }} />
            </span>
            Ne jamais envoyer
          </button>
        </span>
      </div>
      {ouvert && c.historique.length > 0 && (
        <div style={{ borderTop: '1px solid #f1f5f9', paddingTop: 9, display: 'flex', flexDirection: 'column', gap: 5 }}>
          {c.historique.map(h => (
            <div key={h.le} style={{ fontSize: 12.5, color: '#475569' }}>
              <b style={{ color: '#1a2332' }}>{jour(h.le, true)}</b>{' · mail envoyé → '}
              {h.reponse ? <span style={{ color: '#0f7a4f', fontWeight: 700 }}>{h.reponse}</span> : <span style={{ color: '#94a3b8' }}>pas de réponse</span>}
              {h.reponduLe ? <span style={{ color: '#94a3b8' }}>{` (le ${jour(h.reponduLe)})`}</span> : null}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
