'use client';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '@/lib/supabase';
import styles from './Page.module.css';
import {
  BLOCS, CHAMPS, CLE_HISTORIQUE, CLE_IDENTITE, HISTORIQUE_MAX, IDENTITE_DEFAUT, LIB_FONDS, PREVENIR_JOURS,
  aRevoir, ecarts, etatCarte, formeCourte, lignesMandataire, lireHistorique, lireIdentite, phraseFonds,
  type Bloc, type Champ, type Fonds, type IdentiteAgence, type Modif,
} from '@/lib/agence';
import { BAREME, BAREME_VENTE, HONORAIRES_TAUX, tauxTexte } from '@/lib/mandat';

/* ═══ Paramètres · Agence ═════════════════════════════════════════════════
   L'identité de l'agence que les documents impriment (src/lib/agence.ts).
   Elle s'enregistre ici, avec son propre bouton : le « Sauvegarder tout »
   de la page n'y touche pas. Chaque modification entre dans l'historique,
   datée, avec l'ancienne et la nouvelle valeur. */

const SIGNATURE = 'agence/signature.png';
const NAVY = '#34496e', OR = '#c9a84c', OR_FONCE = '#a07c28', GRIS = '#64748b', GRIS_CLAIR = '#94a3b8', TRAIT = '#e3e8f0';

const jourLong = (ymd: string) => new Date(ymd.slice(0, 10) + 'T12:00:00Z')
  .toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Europe/Paris' });
/* Une valeur de l'historique : une date se lit « 12 mai 2027 ». */
const lisible = (v: string) => (/^\d{4}-\d{2}-\d{2}$/.test(v) ? jourLong(v) : v);
const quand = (iso: string) => new Date(iso).toLocaleString('fr-FR', {
  day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Paris',
}).replace(':', ' h ');

/* ── Une pastille d'état, en haut ── */
type Ton = 'vert' | 'or' | 'rouge' | 'gris';
const TONS: Record<Ton, { f: string; t: string; c: string }> = {
  vert: { f: '#f0fdf4', t: '#bbf7d0', c: '#166534' },
  or: { f: '#fffbeb', t: '#fde68a', c: '#92400e' },
  rouge: { f: '#fef2f2', t: '#fecaca', c: '#b91c1c' },
  gris: { f: '#f8fafc', t: TRAIT, c: GRIS },
};
function Etat({ ton, titre, texte }: { ton: Ton; titre: string; texte: string }) {
  const t = TONS[ton];
  return (
    <div style={{ flex: '1 1 200px', minWidth: 0, background: t.f, border: `1px solid ${t.t}`, borderRadius: 12, padding: '10px 12px' }}>
      <div style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: 0.8, textTransform: 'uppercase', color: t.c, opacity: 0.85 }}>{titre}</div>
      <div style={{ fontSize: 13.5, fontWeight: 700, color: t.c, marginTop: 3, lineHeight: 1.4 }}>{texte}</div>
    </div>
  );
}

/* ── Un champ (déclaré ici, hors du composant : sinon il perd le focus à
   chaque lettre, AGENTS.md §2.4) ── */
function ChampAgence({ c, valeur, erreur, change, onChange }: {
  c: Champ; valeur: string; erreur?: string; change: boolean; onChange: (v: string) => void;
}) {
  return (
    <div style={{ gridColumn: c.large ? '1 / -1' : undefined, minWidth: 0 }} data-champ={c.cle}>
      <label className={styles.label} htmlFor={`ag-${c.cle}`}>
        {c.lib}
        {!c.requis && <span style={{ fontWeight: 500, color: GRIS_CLAIR, textTransform: 'none', letterSpacing: 0 }}>{' · facultatif'}</span>}
      </label>
      <input id={`ag-${c.cle}`} className={styles.input} type={c.type === 'date' ? 'date' : c.type === 'email' ? 'email' : 'text'}
        value={valeur} maxLength={c.max} placeholder={c.exemple ? `Ex : ${c.exemple}` : undefined}
        onChange={e => onChange(e.target.value)}
        style={{ borderColor: erreur ? '#f87171' : change ? OR : undefined, background: change && !erreur ? '#fffdf5' : undefined }} />
      {erreur
        ? <div style={{ fontSize: 12, color: '#b91c1c', marginTop: 4 }}>{erreur}</div>
        : c.aide ? <div style={{ fontSize: 12, color: GRIS_CLAIR, marginTop: 4, lineHeight: 1.45 }}>{c.aide}</div> : null}
    </div>
  );
}

function TeteBloc({ e, titre, sert }: { e: string; titre: string; sert: string }) {
  return (
    <div style={{ marginBottom: 14 }}>
      <div style={{ fontFamily: "'Plus Jakarta Sans',sans-serif", fontWeight: 700, fontSize: 15, color: NAVY }}>{`${e} ${titre}`}</div>
      <div style={{ fontSize: 12.5, color: GRIS, marginTop: 3, lineHeight: 1.5 }}>{sert}</div>
    </div>
  );
}

/* Les guillemets et les deux-points ne se séparent pas de leur mot en bout
   de ligne (à l'écran seulement : le texte du mandat, lui, ne change pas). */
const fr = (t: string) => t.replace(/« /g, '«\u00a0').replace(/ »/g, '\u00a0»').replace(/ ([:;?!])/g, '\u00a0$1').replace(/n° /g, 'n°\u00a0');

/* ── Ce que lit le client : la fiche « le mandataire » du mandat, en direct ── */
function Apercu({ id }: { id: IdentiteAgence }) {
  return (
    <div style={{ border: `1px solid ${TRAIT}`, borderRadius: 14, background: '#f8fafc', padding: '14px 16px' }}>
      <div style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: 1, textTransform: 'uppercase', color: GRIS_CLAIR }}>Le mandataire</div>
      <div style={{ fontFamily: "'Plus Jakarta Sans',sans-serif", fontWeight: 800, fontSize: 15, color: NAVY, marginTop: 4 }}>{id.nom.toUpperCase()}</div>
      {lignesMandataire(id).map((l, i) => (
        <div key={i} style={{ fontSize: 13, color: '#334155', lineHeight: 1.55, marginTop: 4 }}>{fr(l)}</div>
      ))}
      <div style={{ fontSize: 13, fontWeight: 700, color: NAVY, marginTop: 8, paddingBottom: 2, borderBottom: `2px solid ${OR}`, display: 'inline' }}>{fr(phraseFonds(id))}</div>
      <div style={{ fontSize: 12.5, color: GRIS, marginTop: 12, lineHeight: 1.5 }}>
        {`Médiateur : ${id.mediateurNom}, ${id.mediateurAdresse}, ${id.mediateurSite}.`}
      </div>
      <div style={{ fontSize: 12.5, color: GRIS, marginTop: 4, lineHeight: 1.5 }}>
        {`Fait à ${id.ville} · pied de page : ${id.nom} · ${id.societe}, ${formeCourte(id)} · carte professionnelle ${id.carte}`}
      </div>
    </div>
  );
}

export default function ParamAgence() {
  const [enregistree, setEnregistree] = useState<IdentiteAgence | null>(null);
  const [brouillon, setBrouillon] = useState<IdentiteAgence>(IDENTITE_DEFAUT);
  const [historique, setHistorique] = useState<Modif[]>([]);
  const [jamais, setJamais] = useState(true);
  const [erreurLecture, setErreurLecture] = useState('');
  const [essai, setEssai] = useState(false);          // on montre les erreurs après un premier « Enregistrer »
  const [enCours, setEnCours] = useState('');
  const [note, setNote] = useState('');
  const [voirHisto, setVoirHisto] = useState(false);
  const [signature, setSignature] = useState<string | null | undefined>(undefined);   // url signée, null = aucune
  const fichier = useRef<HTMLInputElement>(null);

  const charger = useCallback(async () => {
    const { data, error } = await supabase.from('parametres').select('cle, valeur').in('cle', [CLE_IDENTITE, CLE_HISTORIQUE]);
    if (error) { setErreurLecture(error.message); return; }
    const brut = data?.find(x => x.cle === CLE_IDENTITE)?.valeur ?? null;
    const id = lireIdentite(brut);
    setJamais(!brut);
    setEnregistree(id); setBrouillon(id);
    setHistorique(lireHistorique(data?.find(x => x.cle === CLE_HISTORIQUE)?.valeur ?? null));
  }, []);

  const chargerSignature = useCallback(async () => {
    const l = await supabase.storage.from('mandats').list('agence');
    if (l.error || !l.data?.some(x => x.name === 'signature.png')) { setSignature(null); return; }
    const u = await supabase.storage.from('mandats').createSignedUrl(SIGNATURE, 600);
    setSignature(u.error ? null : u.data.signedUrl);
  }, []);

  useEffect(() => { charger(); chargerSignature(); }, [charger, chargerSignature]);

  const erreurs = useMemo(() => aRevoir(brouillon), [brouillon]);
  const modifs = useMemo(() => enregistree ? ecarts(enregistree, brouillon) : [], [enregistree, brouillon]);
  const changes = useMemo(() => new Set(modifs.map(m => m.cle)), [modifs]);
  const carte = etatCarte(brouillon);

  const poser = (cle: keyof IdentiteAgence, v: string) => setBrouillon(b => ({ ...b, [cle]: v }));

  async function enregistrer() {
    if (!enregistree || !modifs.length) return;
    setEssai(true);
    if (Object.keys(erreurs).length) {
      const premier = CHAMPS.find(c => erreurs[c.cle]);
      if (premier) document.querySelector(`[data-champ="${premier.cle}"]`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      return;
    }
    const le = new Date().toISOString();
    /* On range ce qui s'imprimera : lireIdentite nettoie les espaces. */
    const propre = lireIdentite(JSON.stringify(brouillon));
    const lignes = ecarts(enregistree, propre, le);
    const histo = [...lignes, ...historique].slice(0, HISTORIQUE_MAX);
    setEnCours('enregistrer');
    const { error } = await supabase.from('parametres').upsert([
      { cle: CLE_IDENTITE, valeur: JSON.stringify(propre), updated_at: le },
      { cle: CLE_HISTORIQUE, valeur: JSON.stringify(histo), updated_at: le },
    ], { onConflict: 'cle' });
    setEnCours('');
    if (error) { alert("L'identité de l'agence n'a pas pu être enregistrée.\n\n" + error.message); return; }
    setEnregistree(propre); setBrouillon(propre); setHistorique(histo); setJamais(false); setEssai(false);
    setNote(`${lignes.length} modification${lignes.length > 1 ? 's' : ''} enregistrée${lignes.length > 1 ? 's' : ''} : les prochains documents les reprennent.`);
    setTimeout(() => setNote(''), 5000);
  }

  function annuler() { if (enregistree) { setBrouillon(enregistree); setEssai(false); } }

  async function deposerSignature(f: File | undefined) {
    if (!f) return;
    if (f.type !== 'image/png') { alert('La signature doit être une image PNG, sur fond transparent.'); return; }
    if (f.size > 2_000_000) { alert('Cette image est trop lourde (2 Mo au plus).'); return; }
    setEnCours('signature');
    const { error } = await supabase.storage.from('mandats').upload(SIGNATURE, f, { upsert: true, contentType: 'image/png' });
    if (error) { setEnCours(''); alert("La signature n'a pas pu être déposée.\n\n" + error.message); return; }
    /* Elle entre dans l'historique, comme un champ. */
    const le = new Date().toISOString();
    const ligne: Modif = { le, cle: 'signature', lib: 'Signataire · Signature manuscrite', avant: signature ? 'une signature' : 'aucune', apres: 'nouvelle signature déposée' };
    const histo = [ligne, ...historique].slice(0, HISTORIQUE_MAX);
    const { error: eH } = await supabase.from('parametres').upsert({ cle: CLE_HISTORIQUE, valeur: JSON.stringify(histo), updated_at: le }, { onConflict: 'cle' });
    setEnCours('');
    if (eH) alert("La signature est déposée, mais l'historique n'a pas pu être mis à jour.\n\n" + eH.message);
    else setHistorique(histo);
    await chargerSignature();
    setNote('Signature déposée : elle apparaîtra sur les prochains mandats signés.');
    setTimeout(() => setNote(''), 5000);
  }

  if (erreurLecture) return <div className={`${styles.card} ${styles.carteForm}`} style={{ padding: 24, color: '#b91c1c', fontSize: 13 }}>{`L'identité de l'agence n'a pas pu être lue : ${erreurLecture}`}</div>;
  if (!enregistree) return <div className={`${styles.card} ${styles.carteForm}`} style={{ padding: 24, color: GRIS_CLAIR, fontSize: 13 }}>Chargement…</div>;

  const carteEtat: { ton: Ton; texte: string } =
    carte.etat === 'expiree' ? { ton: 'rouge', texte: `Expirée depuis le ${jourLong(brouillon.carteFin)} : renouvelle-la avant tout nouveau mandat` }
    : carte.etat === 'bientot' ? { ton: 'or', texte: `À renouveler : expire dans ${carte.jours} jour${carte.jours === 1 ? '' : 's'}, le ${jourLong(brouillon.carteFin)}` }
    : carte.etat === 'ok' ? { ton: 'vert', texte: `Valable jusqu’au ${jourLong(brouillon.carteFin)}` }
    : { ton: 'gris', texte: `Ajoute sa date de fin : le CRM te prévient ${PREVENIR_JOURS} jours avant` };
  const derniere = historique[0];
  const erreurDe = (c: Champ) => (essai ? erreurs[c.cle] : undefined);

  const champsDe = (b: Bloc) => CHAMPS.filter(c => c.bloc === b && (!c.siGarantie || brouillon.fonds === 'garantie'));
  const grille = (b: Bloc) => (
    <div className={styles.param2} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
      {champsDe(b).map(c => (
        <ChampAgence key={c.cle} c={c} valeur={String(brouillon[c.cle] || '')} erreur={erreurDe(c)} change={changes.has(c.cle)}
          onChange={v => poser(c.cle, v)} />
      ))}
    </div>
  );
  const carteBloc = (id: Bloc, plus?: React.ReactNode, avant?: React.ReactNode) => {
    const b = BLOCS.find(x => x.id === id)!;
    return (
      <div key={id} className={`${styles.card} ${styles.carteForm}`} style={{ padding: 22 }}>
        <TeteBloc e={b.e} titre={b.titre} sert={b.sert} />
        {avant}
        {champsDe(id).length > 0 && grille(id)}
        {plus}
      </div>
    );
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* L'état, en un coup d'œil */}
      <div className={`${styles.card} ${styles.carteForm}`} style={{ padding: 22 }}>
        <div style={{ fontFamily: "'Plus Jakarta Sans',sans-serif", fontWeight: 700, fontSize: 16, color: NAVY }}>🏢 Identité de l’agence</div>
        <p style={{ fontSize: 13, color: GRIS, lineHeight: 1.6, margin: '6px 0 14px' }}>
          {'Ce que tes documents impriment : le mandat de recherche aujourd’hui, les mandats de vente et les offres ensuite. Un document déjà signé ne change jamais ; les suivants prennent l’identité du jour de leur signature.'}
        </p>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <Etat ton={carteEtat.ton} titre="Carte professionnelle" texte={carteEtat.texte} />
          <Etat ton={signature ? 'vert' : signature === null ? 'or' : 'gris'} titre="Signature manuscrite"
            texte={signature ? 'Déposée : elle figure sur chaque mandat signé' : signature === null ? 'Pas encore déposée' : '…'} />
          <Etat ton="gris" titre="Dernière modification"
            texte={derniere ? `Le ${quand(derniere.le)}` : jamais ? 'Jamais : c’est l’identité d’origine' : '—'} />
        </div>
      </div>

      {/* Ce que lit le client */}
      <div className={`${styles.card} ${styles.carteForm}`} style={{ padding: 22 }}>
        <TeteBloc e="👁️" titre="Ce que lit ton client" sert="La fiche « le mandataire » de son mandat de recherche, telle qu’elle s’imprimera. Elle suit ce que tu tapes." />
        <Apercu id={lireIdentite(JSON.stringify(brouillon))} />
      </div>

      {carteBloc('identite')}
      {carteBloc('carte')}
      {carteBloc('fonds', undefined, (
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: brouillon.fonds === 'garantie' ? 16 : 0 }}>
          {(['non', 'garantie'] as Fonds[]).map(f => {
            const on = brouillon.fonds === f;
            return (
              <button key={f} type="button" onClick={() => setBrouillon(b => ({ ...b, fonds: f }))} aria-pressed={on}
                style={{ flex: '1 1 220px', textAlign: 'left', padding: '11px 13px', borderRadius: 11, cursor: 'pointer', fontFamily: 'inherit',
                  fontSize: 13.5, fontWeight: 700, lineHeight: 1.35,
                  border: `1.5px solid ${on ? (changes.has('fonds') ? OR : NAVY) : TRAIT}`, background: on ? '#f8fafc' : 'white', color: on ? NAVY : GRIS }}>
                {`${on ? '● ' : '○ '}${LIB_FONDS[f]}`}
              </button>
            );
          })}
        </div>
      ))}
      {carteBloc('assurance')}
      {carteBloc('mediateur')}
      {carteBloc('signataire', (
        <div style={{ marginTop: 16, paddingTop: 16, borderTop: '1px solid #f1f5f9', display: 'flex', gap: 14, alignItems: 'center', flexWrap: 'wrap' }}>
          <div style={{ width: 190, height: 84, borderRadius: 10, border: `1px dashed ${signature ? '#cbd5e1' : '#fcd34d'}`, flexShrink: 0,
            background: 'repeating-conic-gradient(#f1f5f9 0% 25%, white 0% 50%) 0 0 / 14px 14px',
            display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
            {signature
              ? <img src={signature} alt="Ta signature manuscrite" style={{ maxWidth: '92%', maxHeight: '88%', objectFit: 'contain' }} />
              : <span style={{ fontSize: 12, color: GRIS_CLAIR, padding: 10, textAlign: 'center' }}>{signature === null ? 'Aucune signature' : '…'}</span>}
          </div>
          <div style={{ flex: '1 1 220px', minWidth: 0 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: NAVY }}>Signature manuscrite</div>
            <div style={{ fontSize: 12.5, color: GRIS, lineHeight: 1.5, marginTop: 3 }}>
              {'Une image PNG sur fond transparent, rangée dans le dossier privé (jamais dans le code). Elle se pose dans ta case au moment où le client signe.'}
            </div>
            <input ref={fichier} type="file" accept="image/png" style={{ display: 'none' }}
              onChange={e => { deposerSignature(e.target.files?.[0]); e.target.value = ''; }} />
            <button type="button" className={`${styles.btn}`} disabled={enCours === 'signature'} onClick={() => fichier.current?.click()}
              style={{ marginTop: 10 }}>
              {enCours === 'signature' ? 'Envoi…' : signature ? 'Remplacer la signature' : 'Déposer ma signature'}
            </button>
          </div>
        </div>
      ))}
      {carteBloc('coordonnees')}

      {/* Les honoraires : lus ici, réglés client par client */}
      <div className={`${styles.card} ${styles.carteForm}`} style={{ padding: 22 }}>
        <TeteBloc e="💶" titre="Honoraires" sert="Ce que chaque type de mandat propose, et jusqu’où tu peux aller." />
        <div className={styles.param2} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          {[
            ['Mandat de recherche', `${tauxTexte(HONORAIRES_TAUX)} du prix`, `Proposé par défaut · tu peux aller jusqu’à ${tauxTexte(BAREME)}`],
            ['Mandat de vente', `${tauxTexte(BAREME_VENTE)} du prix`, 'Pour les mandats de vente, à venir'],
          ].map(([t, v, d]) => (
            <div key={t} style={{ background: '#f8fafc', border: `1px solid ${TRAIT}`, borderRadius: 11, padding: '10px 12px' }}>
              <div style={{ fontSize: 11.5, fontWeight: 700, color: GRIS_CLAIR, textTransform: 'uppercase', letterSpacing: 0.5 }}>{t}</div>
              <div style={{ fontSize: 15, fontWeight: 800, color: NAVY, marginTop: 3 }}>{v}</div>
              <div style={{ fontSize: 12, color: GRIS, marginTop: 2 }}>{d}</div>
            </div>
          ))}
        </div>
        <div style={{ fontSize: 12.5, color: GRIS, lineHeight: 1.55, marginTop: 10 }}>
          {'Pour un acheteur, tu choisis le taux ou un forfait depuis sa fiche (bouton Mandat). Ces valeurs deviendront modifiables ici avec les mandats de vente : elles entrent dans le calcul du prix maximum de chaque mandat.'}
        </div>
      </div>

      {carteBloc('autres')}

      {/* L'historique */}
      <div className={`${styles.card} ${styles.carteForm}`} style={{ padding: 22 }}>
        <button type="button" onClick={() => setVoirHisto(v => !v)}
          style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', background: 'none', border: 'none', padding: 0, cursor: 'pointer', fontFamily: 'inherit', textAlign: 'left' }}>
          <span style={{ flex: 1, fontFamily: "'Plus Jakarta Sans',sans-serif", fontWeight: 700, fontSize: 15, color: NAVY }}>
            {`🕘 Historique des modifications${historique.length ? ` · ${historique.length}` : ''}`}
          </span>
          <span style={{ fontSize: 13, fontWeight: 700, color: GRIS }}>{voirHisto ? 'Masquer' : 'Afficher'}</span>
        </button>
        {voirHisto && (
          historique.length === 0
            ? <div style={{ fontSize: 13, color: GRIS, marginTop: 12 }}>{'Aucune modification pour l’instant : tes documents impriment l’identité d’origine.'}</div>
            : (
              <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column' }}>
                {historique.map((m, i) => (
                  <div key={i} style={{ padding: '10px 0', borderTop: i ? '1px solid #f1f5f9' : 'none', fontSize: 13, lineHeight: 1.5 }}>
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'baseline' }}>
                      <b style={{ color: NAVY }}>{m.lib}</b>
                      <span style={{ fontSize: 12, color: GRIS_CLAIR }}>{quand(m.le)}</span>
                    </div>
                    <div style={{ color: GRIS, marginTop: 2, overflowWrap: 'anywhere' }}>
                      <span style={{ textDecoration: 'line-through', textDecorationColor: '#cbd5e1' }}>{lisible(m.avant) || 'vide'}</span>
                      <span style={{ color: OR_FONCE, fontWeight: 800 }}>{' → '}</span>
                      <span style={{ color: NAVY }}>{lisible(m.apres) || 'vide'}</span>
                    </div>
                  </div>
                ))}
              </div>
            )
        )}
      </div>

      {note && (
        <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', color: '#166534', borderRadius: 12, padding: '11px 14px', fontSize: 13, fontWeight: 600 }}>{note}</div>
      )}

      {/* La barre d'enregistrement : seulement quand quelque chose a changé */}
      {modifs.length > 0 && (
        <div style={{ position: 'sticky', bottom: 12, zIndex: 5, display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap',
          background: NAVY, color: 'white', borderRadius: 14, padding: '12px 14px', boxShadow: '0 10px 30px rgba(26,35,50,.28)' }}>
          <div style={{ flex: '1 1 260px', minWidth: 0, fontSize: 13.5, lineHeight: 1.4 }}>
            <b>{`${modifs.length} modification${modifs.length > 1 ? 's' : ''}`}</b>
            <span style={{ color: '#cbd5e1' }}>
              {essai && Object.keys(erreurs).length
                ? ` · ${Object.keys(erreurs).length} champ${Object.keys(erreurs).length > 1 ? 's' : ''} à revoir`
                : ' · les prochains documents les reprendront'}
            </span>
          </div>
          <div style={{ flex: '1 1 auto', display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
          <button type="button" onClick={annuler} disabled={!!enCours}
            style={{ background: 'transparent', color: 'white', border: '1px solid rgba(255,255,255,.35)', borderRadius: 10, padding: '9px 14px', fontWeight: 700, fontSize: 13, cursor: 'pointer', fontFamily: 'inherit' }}>
            Annuler
          </button>
          <button type="button" onClick={enregistrer} disabled={!!enCours}
            style={{ background: OR, color: NAVY, border: 'none', borderRadius: 10, padding: '9px 16px', fontWeight: 800, fontSize: 13, cursor: 'pointer', fontFamily: 'inherit' }}>
            {enCours === 'enregistrer' ? 'Enregistrement…' : 'Enregistrer'}
          </button>
          </div>
        </div>
      )}
    </div>
  );
}
