'use client';
import { supabase } from '@/lib/supabase';
import styles from './FicheClient.module.css';
import { ISSUES, issueDe, apprisDe, visitePassee, type Issue } from '@/lib/visites';

/* ═══ Onglet Visites de la fiche client ═══════════════════════════════════
   Les mêmes rubriques que « Vos visites » dans l'espace du client, pour que
   les deux côtés se lisent pareil :
     Compte rendu à faire · À venir · Retenues · Non abouties
   (+ « Sans issue » pour les anciennes visites faites sans issue).
   En tête, « Ce que ses visites ont appris » : ce que la recherche relit
   avant chaque passage. */

const NAVY = '#1a2332', GRIS = '#64748b', CLAIR = '#94a3b8', BORD = '#e3e8f0';
const JAK = "'Plus Jakarta Sans', system-ui, sans-serif";

const jourMois = (d?: string | null) => {
  if (!d) return null;
  const x = new Date(`${String(d).slice(0, 10)}T12:00:00`);
  if (isNaN(x.getTime())) return null;
  return { j: x.getDate(), m: x.toLocaleDateString('fr-FR', { month: 'short' }) };
};
const dateLongue = (d?: string | null) => {
  if (!d) return '';
  const x = new Date(`${String(d).slice(0, 10)}T12:00:00`);
  return isNaN(x.getTime()) ? '' : x.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });
};
const euros = (n: number) => `${Number(n).toLocaleString('fr-FR')} €`;

function Bloc({ d, ton }: { d?: string | null; ton: 'marine' | 'ambre' | 'clair' }) {
  const s = { marine: [NAVY, 'white', 'rgba(255,255,255,.5)', 'none'], ambre: ['#fffbeb', '#92400e', '#d97706', '1px solid #fde68a'], clair: ['#f1f5f9', NAVY, CLAIR, 'none'] }[ton];
  const x = jourMois(d);
  return (
    <div style={{ background: s[0], border: s[3], borderRadius: 11, width: 50, padding: '6px 0', textAlign: 'center', flexShrink: 0 }}>
      {x ? <><div style={{ fontFamily: JAK, fontWeight: 800, fontSize: 19, color: s[1], lineHeight: 1 }}>{x.j}</div><div style={{ fontSize: 9, color: s[2], textTransform: 'uppercase', letterSpacing: 1, marginTop: 2 }}>{x.m}</div></> : <div style={{ color: s[2], fontSize: 18 }}>—</div>}
    </div>
  );
}
function PastilleIssue({ i, offreFaite, suite }: { i: Issue; offreFaite?: boolean; suite?: string }) {
  const x = ISSUES[i];
  const lib = i === 'offre' && offreFaite ? 'Offre faite' : x.crm;
  return <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 11.5, fontWeight: 800, color: x.couleur, background: x.fond, border: `1px solid ${x.trait}`, borderRadius: 99, padding: '3px 10px', whiteSpace: 'nowrap', flexShrink: 0 }}><span aria-hidden="true">{x.e}</span>{lib}{suite ? ` · ${suite}` : ''}</span>;
}
function Raisons({ l, ton = 'non' }: { l?: string[] | null; ton?: 'non' | 'oui' | 'neutre' }) {
  if (!l || !l.length) return null;
  const c = { non: ['#9a3412', '#fff4ef', '#fbd5c5'], oui: ['#166534', '#f0fdf4', '#bbf7d0'], neutre: ['#334155', '#f1f5f9', '#e2e8f0'] }[ton];
  return <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>{l.map(m => <span key={m} style={{ fontSize: 11.5, fontWeight: 700, color: c[0], background: c[1], border: `1px solid ${c[2]}`, borderRadius: 99, padding: '2px 8px' }}>{m}</span>)}</div>;
}
function Etoiles({ n }: { n?: number | null }) {
  if (!n) return null;
  return <span style={{ color: '#c9a84c', letterSpacing: 1 }}>{'★'.repeat(n)}<span style={{ color: '#dbe2ea' }}>{'★'.repeat(Math.max(0, 5 - n))}</span></span>;
}
function Titre({ t, c, n, sous }: { t: string; c: string; n: number; sous?: string }) {
  return (
    <div style={{ margin: '2px 0 8px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 11, fontWeight: 800, color: c, textTransform: 'uppercase', letterSpacing: 1 }}>
        <span style={{ width: 8, height: 8, borderRadius: '50%', background: c }} />{`${t} — ${n}`}
      </div>
      {sous && <div style={{ fontSize: 12, color: GRIS, marginTop: 3 }}>{sous}</div>}
    </div>
  );
}

export default function OngletVisites({ visites, biens, prenom, masques, rechercheId, onCompteRendu, onAnnuler, onRecharger, onMasques }: {
  visites: any[]; biens: any[]; prenom: string; masques: string[]; rechercheId: string;
  onCompteRendu: (v: any) => void; onAnnuler: (v: any) => void;
  onRecharger: () => void; onMasques: () => void;
}) {
  const maintenant = new Date();
  const vivantes = visites.filter(v => v.statut === 'a_venir' || v.statut === 'effectuee');
  const bienDe = (v: any) => biens.find(b => b.id === v.bien_id);
  const titreDe = (v: any) => { const b = bienDe(v); return b?.titre || b?.ville || 'Bien non renseigné'; };
  /* Une 2e visite : une autre visite du même bien, plus ancienne, a eu lieu ou était calée. */
  const revisite = (v: any) => vivantes.some(x => x.id !== v.id && x.bien_id === v.bien_id && String(x.date_visite || '') < String(v.date_visite || ''));

  const aVenir = vivantes.filter(v => v.statut === 'a_venir');
  const aFaire = aVenir.filter(v => visitePassee(v, maintenant));
  const prochaines = aVenir.filter(v => !visitePassee(v, maintenant));
  const faites = vivantes.filter(v => v.statut === 'effectuee').slice().reverse();
  const retenues = faites.filter(v => { const i = issueDe(v); return i === 'offre' || i === 'revoir' || i === 'reflexion'; });
  const nonAbouties = faites.filter(v => issueDe(v) === 'non');
  const sansIssue = faites.filter(v => !issueDe(v));
  const appris = apprisDe(visites, masques);

  async function masquer(t: string) {
    const l = Array.from(new Set([...(masques || []), t]));
    const { error } = await supabase.from('recherches').update({ appris_masques: l }).eq('id', rechercheId);
    if (error) { alert('Pas enregistré : ' + error.message); return; }
    onMasques();
  }
  async function toutReafficher() {
    const { error } = await supabase.from('recherches').update({ appris_masques: [] }).eq('id', rechercheId);
    if (error) { alert('Pas enregistré : ' + error.message); return; }
    onMasques();
  }

  if (vivantes.length === 0) {
    return (
      <div className={styles.emptyTab}>
        <div style={{ fontSize: 32, marginBottom: 10 }}>📅</div>
        <div style={{ fontWeight: 700, color: NAVY }}>Aucune visite</div>
        <div style={{ color: CLAIR, fontSize: 13 }}>{visites.length > 0 ? 'Les visites annulées ne s’affichent plus ici.' : 'Planifiez depuis l’onglet Biens'}</div>
      </div>
    );
  }

  const compteurs: [string, number, string][] = [
    ['Compte rendu à faire', aFaire.length, '#d97706'],
    ['À venir', prochaines.length, '#3b82f6'],
    ['Retenues', retenues.length, '#2563eb'],
    ['Non abouties', nonAbouties.length, '#b4532a'],
    ...(sansIssue.length ? [['Sans issue', sansIssue.length, '#64748b'] as [string, number, string]] : []),
  ];

  /* La réponse du client, telle qu'il l'a donnée dans son espace. */
  const Reponse = ({ v }: { v: any }) => {
    if (!v.avis_client_le || !v.issue || !ISSUES[v.issue as Issue]) return null;
    const i = v.issue as Issue;
    const le = new Date(v.avis_client_le);
    return (
      <div style={{ display: 'flex', gap: 9, alignItems: 'flex-start', background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: 10, padding: '8px 10px', marginTop: 9, fontSize: 12.5, color: '#1e3a8a', lineHeight: 1.45 }}>
        <span aria-hidden="true">💬</span>
        <div style={{ minWidth: 0 }}>
          <b>{`${prenom || 'Le client'} a répondu dans son espace`}</b>
          {`, ${le.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })} à ${le.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })} : `}
          <b>{ISSUES[i].crm}</b>{v.prix_envisage ? `, autour de ${euros(v.prix_envisage)}` : ''}{'.'}
          {v.motifs?.length ? <div style={{ marginTop: 5 }}><Raisons l={v.motifs} ton={i === 'non' ? 'non' : 'neutre'} /></div> : null}
          {v.mot_client ? <div style={{ marginTop: 5 }}>{`« ${v.mot_client} »`}</div> : null}
        </div>
      </div>
    );
  };

  /* Les cartes d'une visite à faire ou à venir : on peut encore changer la
     date, l'heure et le contact, ou l'annuler. */
  const carteOuverte = (v: any, enRetard: boolean) => {
    const ton = enRetard ? '#d97706' : '#3b82f6';
    return (
      <div key={v.id} className={`${styles.card} fc-visite`} style={{ padding: 16, borderLeft: `3px solid ${ton}` }}>
        <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
          <Bloc d={v.date_visite} ton={enRetard ? 'ambre' : 'marine'} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start', flexWrap: 'wrap' }}>
              <div style={{ flex: '1 1 200px', minWidth: 0 }}>
                <div style={{ fontWeight: 700, fontSize: 15, color: NAVY }}>{titreDe(v)}</div>
                <div style={{ fontSize: 12.5, color: GRIS, marginTop: 2 }}>{[dateLongue(v.date_visite), v.heure ? `à ${String(v.heure).slice(0, 5)}` : '', v.contact_agence ? `· ${v.contact_agence}` : ''].filter(Boolean).join(' ')}</div>
              </div>
              {revisite(v) && <span style={{ fontSize: 11.5, fontWeight: 800, color: NAVY, background: '#eef1f6', borderRadius: 99, padding: '3px 10px', flexShrink: 0 }}>2e visite</span>}
              {enRetard && !v.avis_client_le && <span style={{ fontSize: 11, padding: '4px 10px', borderRadius: 20, fontWeight: 700, background: '#fffbeb', color: '#b45309', border: '1px solid #fde68a', flexShrink: 0 }}>📝 Compte rendu à faire</span>}
            </div>
            {enRetard && <Reponse v={v} />}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, marginTop: 12, paddingTop: 12, borderTop: '1px solid #f8fafc', flexWrap: 'wrap' }}>
          <input type="date" defaultValue={v.date_visite?.split('T')[0]} className={styles.inp} style={{ flex: 1, minWidth: 140 }} onChange={async e => { const { error } = await supabase.from('visites').update({ date_visite: e.target.value }).eq('id', v.id); if (error) alert('Date non enregistrée : ' + error.message); onRecharger(); }} />
          <input type="time" defaultValue={v.heure} className={styles.inp} style={{ width: 110 }} onChange={async e => { const { error } = await supabase.from('visites').update({ heure: e.target.value }).eq('id', v.id); if (error) alert('Heure non enregistrée : ' + error.message); }} />
          <input className={styles.inp} placeholder="Contact agence" defaultValue={v.contact_agence} style={{ flex: 1, minWidth: 140 }} onChange={async e => { const { error } = await supabase.from('visites').update({ contact_agence: e.target.value }).eq('id', v.id); if (error) alert('Contact non enregistré : ' + error.message); }} />
          <button className={`${styles.btn} ${styles.btnPrimary}`} onClick={() => onCompteRendu(v)}>{enRetard ? '📝 Faire le compte rendu' : '✓ Effectuée'}</button>
          <button className={styles.btn} onClick={() => onAnnuler(v)}
            style={{ color: '#dc2626', borderColor: '#fecaca' }}
            title="La visite ne se fera pas : elle sort de l'agenda et de l'espace du client">
            {enRetard ? '✕ Pas eu lieu' : '✕ Annuler'}
          </button>
        </div>
      </div>
    );
  };

  /* « À revoir » : la 2e visite est-elle déjà calée ? */
  const suiteRevoir = (v: any) => {
    const n = prochaines.find(x => x.bien_id === v.bien_id && String(x.date_visite || '') > String(v.date_visite || ''));
    const d = n ? jourMois(n.date_visite) : null;
    return d ? `2e visite le ${d.j} ${d.m}` : '2e visite à caler';
  };

  /* Une visite faite, avec son issue. */
  const carteFaite = (v: any) => {
    const i = issueDe(v);
    const b = bienDe(v);
    const offreFaite = b?.badge_retour === 'offre_faite';
    const x = i ? ISSUES[i] : null;
    const source = !i ? 'Pas encore d’issue'
      : v.issue_par === 'client' && v.avis_client_le ? (v.commentaire ? 'Son avis dans l’espace, repris dans ton compte rendu' : 'Son avis dans l’espace')
      : 'Ton compte rendu';
    return (
      <div key={v.id} className={`${styles.card} fc-visite`} style={{ padding: '13px 16px', borderLeft: `3px solid ${x ? x.couleur : '#cbd5e1'}` }}>
        <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
          <Bloc d={v.date_visite} ton="clair" />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start', flexWrap: 'wrap' }}>
              <div style={{ flex: '1 1 200px', minWidth: 0 }}>
                <div style={{ fontWeight: 700, fontSize: 15, color: NAVY }}>{titreDe(v)}</div>
                <div style={{ fontSize: 12.5, color: GRIS, marginTop: 2 }}>{[dateLongue(v.date_visite), v.heure ? `à ${String(v.heure).slice(0, 5)}` : '', v.contact_agence ? `· ${v.contact_agence}` : ''].filter(Boolean).join(' ')}</div>
              </div>
              {i && <PastilleIssue i={i} offreFaite={offreFaite} suite={i === 'offre' && v.prix_envisage && !offreFaite ? `autour de ${euros(v.prix_envisage)}` : i === 'revoir' ? suiteRevoir(v) : undefined} />}
            </div>
            {(v.motifs?.length || v.aime?.length) ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 5, marginTop: 8 }}>
                <Raisons l={v.motifs} ton={i === 'non' ? 'non' : 'neutre'} />
                <Raisons l={v.aime} ton="oui" />
              </div>
            ) : null}
            {v.mot_client ? <div style={{ fontSize: 12.5, color: '#1e3a8a', background: '#eff6ff', borderRadius: 9, padding: '7px 10px', marginTop: 8, lineHeight: 1.45 }}>{`« ${v.mot_client} » — ${prenom || 'le client'}`}</div> : null}
            {v.commentaire ? <div style={{ fontSize: 13, color: NAVY, background: '#f8fafc', borderRadius: 9, padding: '8px 11px', marginTop: 8, lineHeight: 1.5 }}>{v.commentaire}</div> : null}
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 8, fontSize: 11.5, color: CLAIR, flexWrap: 'wrap' }}>
              <Etoiles n={v.note_etoiles} />
              <span>{source}</span>
              {v.retenir === false && i === 'non' ? <span>· ne compte pas pour la recherche</span> : null}
              <span style={{ flexGrow: 1 }} />
              <button type="button" onClick={() => onCompteRendu(v)}
                style={{ background: 'none', border: 'none', color: '#4a6b90', fontWeight: 700, fontSize: 12.5, cursor: 'pointer', padding: 0, fontFamily: 'inherit' }}>
                {i ? '✎ Modifier' : '📝 Préciser l’issue'}
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  };

  const Ligne = ({ ok, t, n }: { ok?: boolean; t: string; n: number }) => (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 0', fontSize: 13, color: NAVY }}>
      <span aria-hidden="true" style={{ width: 20, height: 20, borderRadius: '50%', background: ok ? '#ecfdf5' : '#fff4ef', color: ok ? '#15803d' : '#c2410c', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 800, flexShrink: 0 }}>{ok ? '✓' : '✕'}</span>
      <span style={{ flex: 1, fontWeight: 600, minWidth: 0 }}>{t}</span>
      <span style={{ fontSize: 11.5, color: CLAIR, fontWeight: 700, whiteSpace: 'nowrap' }}>{`${n} visite${n > 1 ? 's' : ''}`}</span>
      <button type="button" onClick={() => masquer(t)} title="Retirer : ne vaut plus pour la recherche" aria-label={`Retirer « ${t} »`}
        style={{ background: 'none', border: 'none', color: '#cbd5e1', cursor: 'pointer', fontSize: 14, padding: '0 2px' }}>✕</button>
    </div>
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div className="fv-compteurs" style={{ display: 'grid', gridTemplateColumns: `repeat(${compteurs.length}, 1fr)`, gap: 8 }}>
        {compteurs.map(([t, n, c]) => (
          <div key={t} className={styles.card} style={{ padding: '10px 12px', borderTop: `3px solid ${c}` }}>
            <div style={{ fontFamily: JAK, fontWeight: 800, fontSize: 20, color: c }}>{n}</div>
            <div style={{ fontSize: 12, fontWeight: 700, color: GRIS }}>{t}</div>
          </div>
        ))}
      </div>
      <style>{`@media (max-width: 640px){ .fv-compteurs{ grid-template-columns: 1fr 1fr !important } .fv-appris{ grid-template-columns: 1fr !important } }`}</style>

      <div className={styles.card} style={{ padding: '14px 16px', borderLeft: '3px solid #c9a84c' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span aria-hidden="true">🔎</span>
          <span style={{ fontFamily: JAK, fontWeight: 800, fontSize: 15, color: NAVY, flex: 1 }}>Ce que ses visites ont appris</span>
          {masques?.length ? <button type="button" onClick={toutReafficher} style={{ background: 'none', border: 'none', color: '#4a6b90', fontWeight: 700, fontSize: 12, cursor: 'pointer', fontFamily: 'inherit' }}>{`Réafficher ${masques.length} ligne${masques.length > 1 ? 's' : ''} retirée${masques.length > 1 ? 's' : ''}`}</button> : null}
        </div>
        {appris.eviter.length || appris.aime.length ? (
          <div className="fv-appris" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24, marginTop: 8 }}>
            <div>
              <div style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: 1, textTransform: 'uppercase', color: '#c2410c', marginBottom: 2 }}>À éviter</div>
              {appris.eviter.length ? appris.eviter.map(x => <Ligne key={x.t} t={x.t} n={x.n} />) : <div style={{ fontSize: 12.5, color: CLAIR, padding: '4px 0' }}>Rien pour l’instant.</div>}
            </div>
            <div>
              <div style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: 1, textTransform: 'uppercase', color: '#15803d', marginBottom: 2 }}>Il a aimé</div>
              {appris.aime.length ? appris.aime.map(x => <Ligne key={x.t} ok t={x.t} n={x.n} />) : <div style={{ fontSize: 12.5, color: CLAIR, padding: '4px 0' }}>Rien pour l’instant.</div>}
            </div>
          </div>
        ) : null}
        <div style={{ fontSize: 12, color: GRIS, marginTop: 8, lineHeight: 1.45 }}>
          {appris.eviter.length || appris.aime.length
            ? 'Tiré de tes comptes rendus et de ses avis, surtout des visites non abouties. La recherche relit ce bloc avant chaque passage. Une ligne qui ne vaut plus, tu la retires.'
            : 'Rien encore. Les raisons des visites non abouties et ce qui lui a plu s’afficheront ici, et la recherche les relira avant chaque passage.'}
        </div>
      </div>

      {aFaire.length > 0 && (
        <div>
          <Titre t="Compte rendu à faire" c="#d97706" n={aFaire.length} sous="La date est passée : il voit déjà ce bien dans « Visités ». Visite repoussée : change la date. Pas eu lieu : dis-le." />
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>{aFaire.map(v => carteOuverte(v, true))}</div>
        </div>
      )}
      {prochaines.length > 0 && (
        <div>
          <Titre t="À venir" c="#3b82f6" n={prochaines.length} />
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>{prochaines.map(v => carteOuverte(v, false))}</div>
        </div>
      )}
      {retenues.length > 0 && (
        <div>
          <Titre t="Retenues" c="#2563eb" n={retenues.length} />
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>{retenues.map(carteFaite)}</div>
        </div>
      )}
      {nonAbouties.length > 0 && (
        <div>
          <Titre t="Non abouties" c="#b4532a" n={nonAbouties.length} sous="L’historique reste : chaque raison nourrit « Ce que ses visites ont appris »." />
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>{nonAbouties.map(carteFaite)}</div>
        </div>
      )}
      {sansIssue.length > 0 && (
        <div>
          <Titre t="Sans issue" c="#64748b" n={sansIssue.length} sous="Faites avant les issues, ou sans en choisir une. Il peut encore donner son avis dans son espace." />
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>{sansIssue.map(carteFaite)}</div>
        </div>
      )}
    </div>
  );
}
