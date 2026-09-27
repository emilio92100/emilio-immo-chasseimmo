'use client';
import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { CLE_IDENTITE, etatCarte, lireIdentite, type EtatCarte } from '@/lib/agence';

/* ═══ Le rappel de la carte professionnelle ═══════════════════════════════
   Deux mois avant l'échéance saisie dans Paramètres › Agence, un bandeau sur
   le tableau de bord : « à renouveler ». Une fois expirée, il s'affiche sur
   tous les écrans, parce qu'aucun mandat ne devrait plus partir.
   « Plus tard » le range jusqu'au lendemain (ce navigateur seulement). */

const CLE_MASQUE = 'emilio_rappel_carte_masque';
const auj = () => new Date().toISOString().slice(0, 10);

export default function RappelCarte({ page, onNavigate }: { page: string; onNavigate: (p: string) => void }) {
  const [carte, setCarte] = useState<(EtatCarte & { fin: string }) | null>(null);
  const [masque, setMasque] = useState(false);

  useEffect(() => {
    let vivant = true;
    supabase.from('parametres').select('valeur').eq('cle', CLE_IDENTITE).maybeSingle().then(({ data, error }) => {
      if (!vivant || error) return;
      const id = lireIdentite(data?.valeur ?? null);
      setCarte({ ...etatCarte(id), fin: id.carteFin });
    });
    try { setMasque(localStorage.getItem(CLE_MASQUE) === auj()); } catch { /* navigation privée : on affiche */ }
    return () => { vivant = false; };
  }, [page]);

  if (!carte || (carte.etat !== 'bientot' && carte.etat !== 'expiree')) return null;
  const expiree = carte.etat === 'expiree';
  if (!expiree && (page !== 'dashboard' || masque)) return null;
  if (page === 'parametres') return null;

  const fin = new Date(carte.fin + 'T12:00:00Z').toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Europe/Paris' });
  const texte = expiree
    ? `Elle a expiré le ${fin}. Renouvelle-la avant de faire signer un nouveau mandat, puis mets la date à jour.`
    : `Elle expire le ${fin}, dans ${carte.jours} jour${carte.jours === 1 ? '' : 's'}. Pense à la renouveler auprès de la CCI.`;

  return (
    <div role="status" style={{
      display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', margin: '16px clamp(12px, 3vw, 28px) 0', padding: '11px 14px', borderRadius: 12,
      background: expiree ? '#fef2f2' : '#fffbeb', border: `1px solid ${expiree ? '#fecaca' : '#fde68a'}`, color: expiree ? '#b91c1c' : '#92400e',
      fontSize: 13.5, lineHeight: 1.45,
    }}>
      <span style={{ flex: '1 1 260px', minWidth: 0 }}><b>{expiree ? 'Carte professionnelle expirée' : 'Carte professionnelle à renouveler'}</b>{` · ${texte}`}</span>
      <button type="button" onClick={() => onNavigate('parametres')}
        style={{ background: expiree ? '#b91c1c' : 'var(--emilio-fond)', color: 'white', border: 'none', borderRadius: 9, padding: '8px 12px', fontWeight: 700, fontSize: 12.5, cursor: 'pointer', fontFamily: 'inherit' }}>
        Mettre à jour la date
      </button>
      {!expiree && (
        <button type="button" onClick={() => { setMasque(true); try { localStorage.setItem(CLE_MASQUE, auj()); } catch { /* rien */ } }}
          style={{ background: 'transparent', color: 'inherit', border: 'none', padding: '8px 6px', fontWeight: 700, fontSize: 12.5, cursor: 'pointer', fontFamily: 'inherit', textDecoration: 'underline' }}>
          Plus tard
        </button>
      )}
    </div>
  );
}
