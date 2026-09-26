'use client';
import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import styles from './Page.module.css';
import { ALERTES_MAIL, CLE_ALERTES, alertesCoupees, valeurAlertes, type Alerte, type CleAlerte } from '@/lib/alertes';

/* ═══ Paramètres · Alertes mail ═══════════════════════════════════════════
   Les mails que le CRM envoie à Alexandre (« Emilio · CRM »), un
   interrupteur chacun. La liste et la règle sont dans src/lib/alertes.ts ;
   les routes qui envoient relisent le réglage juste avant chaque envoi.
   Chaque clic s'enregistre tout de suite : le bouton « Sauvegarder tout »
   ne touche pas à ce réglage (voir PageParametres). */

const GROUPES: { id: Alerte['groupe']; titre: string }[] = [
  { id: 'clients', titre: 'Tes clients' },
  { id: 'mandats', titre: 'Les mandats' },
  { id: 'auto', titre: 'Le point automatique' },
];

/* Ce qui n'arrive jamais par mail : Alexandre croyait recevoir les avis. */
const JAMAIS = [
  'Les avis « Ça me plaît » et « Pas pour moi »',
  'Les messages du client',
  'Les demandes de rappel',
  'Les changements de critères',
  'Les fins de recherche (trouvé, pause, arrêt)',
  'Les réponses au mail « Où en est votre recherche ? »',
];

function Interrupteur({ on, onClick, disabled, label }: { on: boolean; onClick: () => void; disabled?: boolean; label: string }) {
  return (
    <button type="button" role="switch" aria-checked={on} aria-label={label} onClick={onClick} disabled={disabled}
      style={{ width: 44, height: 25, borderRadius: 99, border: 'none', cursor: disabled ? 'wait' : 'pointer', position: 'relative', background: on ? '#10b981' : '#cbd5e1', transition: 'background .15s', flexShrink: 0, padding: 0 }}>
      <span style={{ position: 'absolute', top: 3, left: on ? 22 : 3, width: 19, height: 19, borderRadius: '50%', background: 'white', transition: 'left .15s', boxShadow: '0 1px 3px rgba(0,0,0,.2)' }} />
    </button>
  );
}

/* Espaces insécables à la française : un « ou un : ne reste jamais seul en
   bout de ligne sur un téléphone. */
const fr = (t: string) => t.replace(/« /g, '«\u00a0').replace(/ »/g, '\u00a0»').replace(/ ([:;?!])/g, '\u00a0$1');

const RUBRIQUE: React.CSSProperties = { fontSize: 10.5, fontWeight: 800, letterSpacing: 1, textTransform: 'uppercase', color: '#94a3b8', margin: '22px 0 4px' };

export default function ParamAlertes() {
  const [coupees, setCoupees] = useState<Set<CleAlerte> | null>(null);
  const [erreur, setErreur] = useState('');
  const [enCours, setEnCours] = useState(false);
  const [note, setNote] = useState('');

  useEffect(() => {
    supabase.from('parametres').select('valeur').eq('cle', CLE_ALERTES).maybeSingle().then(({ data, error }) => {
      if (error) { setErreur(error.message); return; }
      setCoupees(alertesCoupees(data?.valeur as string | null));
    });
  }, []);

  async function enregistrer(suivant: Set<CleAlerte>) {
    const avant = coupees;
    setCoupees(suivant); setEnCours(true);
    const { error } = await supabase.from('parametres')
      .upsert({ cle: CLE_ALERTES, valeur: valeurAlertes(suivant), updated_at: new Date().toISOString() }, { onConflict: 'cle' });
    setEnCours(false);
    if (error) { setCoupees(avant); alert("Le réglage n'a pas pu être enregistré.\n\n" + error.message); return; }
    setNote('Enregistré'); setTimeout(() => setNote(''), 2000);
  }

  function basculer(cle: CleAlerte) {
    if (!coupees) return;
    const s = new Set(coupees);
    if (s.has(cle)) s.delete(cle); else s.add(cle);
    enregistrer(s);
  }

  if (erreur) return <div className={`${styles.card} ${styles.carteForm}`} style={{ padding: 24, color: '#b91c1c', fontSize: 13 }}>{`Les alertes n'ont pas pu être lues : ${erreur}`}</div>;
  if (!coupees) return <div className={`${styles.card} ${styles.carteForm}`} style={{ padding: 24, color: '#94a3b8', fontSize: 13 }}>Chargement…</div>;

  const total = ALERTES_MAIL.length;
  const recues = total - coupees.size;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div className={`${styles.card} ${styles.carteForm}`} style={{ padding: 24 }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
          <div>
            <div style={{ fontFamily: "'Plus Jakarta Sans',sans-serif", fontWeight: 800, fontSize: 17, color: '#1a2332' }}>🔔 Alertes par mail</div>
            <div style={{ fontSize: 13, color: '#64748b', marginTop: 4, lineHeight: 1.5, maxWidth: 580 }}>{fr('Les mails que le CRM t’envoie, avec l’expéditeur « Emilio · CRM ». Coupe ceux dont tu n’as pas besoin : l’événement reste toujours visible dans le CRM, rien ne se perd.')}</div>
          </div>
          {note && <span style={{ fontSize: 12, fontWeight: 700, color: '#10b981' }}>✓ {note}</span>}
        </div>

        <div style={{ marginTop: 18, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap', background: '#f8fafc', border: '1px solid #e3e8f0', borderRadius: 12, padding: '11px 14px' }}>
          <span style={{ fontSize: 13.5, color: '#1a2332' }}>{'Tu reçois '}<b>{`${recues} alerte${recues > 1 ? 's' : ''} sur ${total}`}</b></span>
          <span style={{ display: 'inline-flex', gap: 14 }}>
            <button type="button" disabled={enCours || coupees.size === total} onClick={() => enregistrer(new Set(ALERTES_MAIL.map(a => a.cle)))}
              style={{ background: 'none', border: 'none', padding: 0, fontFamily: 'inherit', fontSize: 12.5, fontWeight: 700, color: coupees.size === total ? '#cbd5e1' : '#64748b', cursor: 'pointer' }}>
              Tout couper
            </button>
            <button type="button" disabled={enCours || coupees.size === 0} onClick={() => enregistrer(new Set())}
              style={{ background: 'none', border: 'none', padding: 0, fontFamily: 'inherit', fontSize: 12.5, fontWeight: 700, color: coupees.size === 0 ? '#cbd5e1' : '#4a6b90', cursor: 'pointer' }}>
              Tout recevoir
            </button>
          </span>
        </div>

        {GROUPES.map(g => (
          <div key={g.id}>
            <div style={RUBRIQUE}>{g.titre}</div>
            {ALERTES_MAIL.filter(a => a.groupe === g.id).map(a => {
              const on = !coupees.has(a.cle);
              return (
                <div key={a.cle} style={{ display: 'flex', alignItems: 'flex-start', gap: 14, padding: '14px 0', borderTop: '1px solid #f1f5f9' }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 14, fontWeight: 700, color: on ? '#1a2332' : '#64748b' }}>{a.titre}</div>
                    <div title={a.objet} style={{ marginTop: 6, display: 'flex', alignItems: 'center', gap: 7, maxWidth: '100%', background: on ? '#f4f7fb' : '#f8fafc', border: '1px solid #e6ebf2', borderRadius: 8, padding: '5px 9px', fontSize: 12, color: on ? '#334155' : '#94a3b8' }}>
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}><rect x="3" y="5" width="18" height="14" rx="2" /><path d="m3.5 6.5 8.5 6 8.5-6" /></svg>
                      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minWidth: 0 }}>{a.objet}</span>
                    </div>
                    <div style={{ fontSize: 12.5, color: '#64748b', marginTop: 7, lineHeight: 1.5 }}>{fr(a.quand)}</div>
                    <div style={{ fontSize: 12.5, color: on ? '#94a3b8' : '#0f7a4f', marginTop: 3, lineHeight: 1.5 }}>{fr(`${on ? 'Aussi dans le CRM' : 'Coupé. Tu le vois dans le CRM'} : ${a.crm.charAt(0).toLowerCase()}${a.crm.slice(1)}`)}</div>
                    {a.sauf && !on && <div style={{ fontSize: 12.5, color: '#92400e', marginTop: 3, lineHeight: 1.5 }}>{fr(`Il part quand même si ${a.sauf}`)}</div>}
                  </div>
                  <Interrupteur on={on} disabled={enCours} onClick={() => basculer(a.cle)} label={`${on ? 'Couper' : 'Recevoir'} : ${a.titre}`} />
                </div>
              );
            })}
          </div>
        ))}
      </div>

      <div className={`${styles.card} ${styles.carteForm}`} style={{ padding: 24 }}>
        <div style={{ fontFamily: "'Plus Jakarta Sans',sans-serif", fontWeight: 800, fontSize: 15, color: '#1a2332' }}>Ce que tu ne reçois jamais par mail</div>
        <div style={{ fontSize: 12.5, color: '#64748b', marginTop: 3, lineHeight: 1.5 }}>{fr('Tout ça arrive seulement dans le CRM : dans le suivi du client, et dans Relances quand il faut le rappeler.')}</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '7px 16px', marginTop: 14, fontSize: 13, color: '#334155' }}>
          {JAMAIS.map(t => (
            <span key={t} style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
              <b style={{ color: '#94a3b8', width: 12, flexShrink: 0 }}>·</b><span>{fr(t)}</span>
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}
