'use client';
import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { supabase } from '@/lib/supabase';

/*
 * Le rappel de visite envoyé au client.
 *
 * On part d'UNE visite (la carte de la page Visites, ou le bloc de l'agenda)
 * et on retrouve toutes celles du même client le même jour : un seul mail
 * les annonce toutes, avec l'heure, la photo et l'adresse de chacune
 * (/api/send-mail, mode « visites »). Alexandre voit le texte, peut le
 * retoucher, et décoche une visite s'il ne veut pas la mettre.
 *
 * Après l'envoi, chaque visite du mail garde la date (visites.rappel_envoye_le)
 * et le CRM affiche « Rappel envoyé le … ». La colonne vient de
 * rappel-visites.sql : sans elle, le mail part quand même, et on le dit.
 */

const NAVY = '#1a2332', OR = '#c9a84c', BORD = '#e3e8f0', DOUX = '#5b6678', PALE = '#8d99ab';
const JOURS = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'];
const MOIS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
const MOIS_COURTS = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];

const pad = (n: number) => (n < 10 ? '0' : '') + n;
const cleDe = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const depuisCle = (k: string) => { const [a, m, j] = k.slice(0, 10).split('-').map(Number); return new Date(a, (m || 1) - 1, j || 1); };
const heureFr = (h: string) => { const [hh, mm] = h.slice(0, 5).split(':'); return `${Number(hh)} h${mm && mm !== '00' ? ` ${mm}` : ''}`; };
const jourLong = (d: Date) => `${JOURS[d.getDay()]} ${d.getDate() === 1 ? '1er' : d.getDate()} ${MOIS[d.getMonth()]}`;

/* « Rappel envoyé le 24 sept. à 17:20 » : la mention sous la visite. */
export function libelleRappel(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return 'Rappel envoyé';
  const auj = cleDe(new Date()) === cleDe(d);
  return `Rappel envoyé ${auj ? 'aujourd’hui' : `le ${d.getDate()} ${MOIS_COURTS[d.getMonth()]}`} à ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/* Le lieu montré au client : l'adresse du bien, sinon son quartier. */
export function lieuVisite(b: any): string {
  if (!b) return '';
  const adresse = b.adresse || b.adresse_probable || '';
  const ville = b.ville || '';
  if (adresse) return ville && !String(adresse).toLowerCase().includes(String(ville).toLowerCase()) ? `${adresse}, ${ville}` : adresse;
  return [b.quartier, ville].filter(Boolean).join(', ');
}

type Ligne = { id: string; heure: string | null; titre: string; lieu: string; photo?: string; rappel: string | null };

/* Le texte proposé. Simple, sans mot de métier : c'est le client qui lit. */
export function texteRappel(o: { prenom: string; date: string; heures: (string | null)[] }): { objet: string; corps: string } {
  const n = o.heures.length;
  const ecart = Math.round((depuisCle(o.date).getTime() - depuisCle(cleDe(new Date())).getTime()) / 86400000);
  const jour = jourLong(depuisCle(o.date));
  const quandObjet = ecart === 0 ? 'd’aujourd’hui' : ecart === 1 ? 'de demain' : `du ${jour}`;
  const quandPhrase = ecart === 0 ? 'd’aujourd’hui' : ecart === 1 ? `de demain, ${jour}` : `du ${jour}`;
  const h = n === 1 && o.heures[0] ? heureFr(o.heures[0]) : '';
  const objet = n > 1 ? `Rappel · vos ${n} visites ${quandObjet}` : `Rappel · votre visite ${quandObjet}${h ? ` à ${h}` : ''}`;
  const phrase = n > 1
    ? `Petit rappel pour nos ${n} visites ${quandPhrase}. Le programme est juste en dessous, avec les adresses.`
    : `Petit rappel pour notre visite ${quandPhrase}${h ? `, à ${h}` : ''}. L’adresse est juste en dessous.`;
  const fin = ecart === 0 ? 'À tout à l’heure' : ecart === 1 ? 'À demain' : 'À bientôt';
  const corps = `Bonjour ${o.prenom},\n\n${phrase}\n\nSi vous avez un empêchement, dites-le-moi dès que possible et on trouvera un autre moment.\n\n${fin},\nAlexandre`;
  return { objet, corps };
}

/* Envoi commun (page Visites, agenda) : renvoie un message d'erreur, ou null. */
export async function envoyerMailVisites(o: { clientId: string; rechercheId: string | null; visitesIds: string[]; objet: string; corps: string }): Promise<{ erreur: string | null; avertissement: string | null }> {
  try {
    const res = await fetch('/api/send-mail', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ client_ids: [o.clientId], recherche_id: o.rechercheId, mode: 'visites', visites_ids: o.visitesIds, objet: o.objet, corps: o.corps }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.success) return { erreur: data.error || (data.results || []).find((r: any) => !r.success)?.error || 'Erreur inconnue', avertissement: null };
    return { erreur: null, avertissement: data.avertissement || null };
  } catch (e) {
    return { erreur: (e as Error).message, avertissement: null };
  }
}

export function ModaleRappelVisite({ visiteId, onFerme, onEnvoye }: { visiteId: string; onFerme: () => void; onEnvoye: () => void }) {
  const [monte, setMonte] = useState(false);
  const [chargement, setChargement] = useState(true);
  const [erreur, setErreur] = useState('');
  const [client, setClient] = useState<{ id: string; prenom: string; nom: string; emails: string[] } | null>(null);
  const [rechercheId, setRechercheId] = useState<string | null>(null);
  const [date, setDate] = useState('');
  const [lignes, setLignes] = useState<Ligne[]>([]);
  const [coches, setCoches] = useState<Record<string, boolean>>({});
  const [objet, setObjet] = useState('');
  const [corps, setCorps] = useState('');
  const [retouche, setRetouche] = useState(false);
  const [envoi, setEnvoi] = useState(false);

  useEffect(() => { setMonte(true); }, []);
  /* Comme la fenêtre « Nouveau rendez-vous » : ni un clic à côté ni Échap
     ne la ferment, pour ne pas perdre un texte retouché. ✕ ou Annuler. */

  /* La visite, puis toutes celles du même client ce jour-là. */
  useEffect(() => {
    let vivant = true;
    (async () => {
      const { data: v, error } = await supabase.from('visites').select('*').eq('id', visiteId).single();
      if (!vivant) return;
      if (error || !v) { setErreur(error?.message || 'Visite introuvable.'); setChargement(false); return; }
      if (!v.date_visite) { setErreur('Cette visite n’a pas encore de date.'); setChargement(false); return; }
      let q = supabase.from('visites').select('*, biens(id, titre, ville, quartier, adresse, adresse_probable, photos)')
        .eq('date_visite', v.date_visite).eq('statut', 'a_venir');
      q = v.recherche_id ? q.eq('recherche_id', v.recherche_id) : q.eq('client_id', v.client_id);
      const [{ data: soeurs, error: e2 }, { data: c, error: e3 }] = await Promise.all([
        q, supabase.from('clients').select('id, prenom, nom, emails').eq('id', v.client_id).single(),
      ]);
      if (!vivant) return;
      if (e2 || e3 || !c) { setErreur((e2 || e3)?.message || 'Client introuvable.'); setChargement(false); return; }
      const liste = (soeurs && soeurs.length ? soeurs : [v]) as any[];
      liste.sort((a, b) => String(a.heure || '99').localeCompare(String(b.heure || '99')));
      const l: Ligne[] = liste.map(x => ({
        id: x.id, heure: x.heure ? String(x.heure).slice(0, 5) : null,
        titre: x.biens?.titre || x.biens?.ville || 'Bien', lieu: lieuVisite(x.biens), photo: x.biens?.photos?.[0], rappel: x.rappel_envoye_le || null,
      }));
      setClient({ id: c.id, prenom: c.prenom || '', nom: c.nom || '', emails: (c.emails || []).filter((e: string) => e && e.includes('@')) });
      setRechercheId(v.recherche_id || null);
      setDate(String(v.date_visite).slice(0, 10));
      setLignes(l);
      setCoches(Object.fromEntries(l.map(x => [x.id, true])));
      setChargement(false);
    })();
    return () => { vivant = false; };
  }, [visiteId]);

  const choisies = lignes.filter(l => coches[l.id]);
  const propose = useMemo(
    () => (client && date ? texteRappel({ prenom: client.prenom, date, heures: choisies.map(l => l.heure) }) : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [client, date, choisies.map(l => l.id).join(',')],
  );
  /* Tant qu'Alexandre n'a pas retouché le texte, il suit les cases cochées. */
  useEffect(() => {
    if (propose && !retouche) { setObjet(propose.objet); setCorps(propose.corps); }
  }, [propose, retouche]);

  const dejaEnvoye = lignes.map(l => l.rappel).filter(Boolean).sort().pop() || null;

  async function envoyer() {
    if (!client || !choisies.length || envoi) return;
    if (!objet.trim()) { alert('Donne un objet au mail.'); return; }
    setEnvoi(true);
    const r = await envoyerMailVisites({ clientId: client.id, rechercheId, visitesIds: choisies.map(l => l.id), objet: objet.trim(), corps });
    setEnvoi(false);
    if (r.erreur) { alert(`Le rappel n'est pas parti.\n\n${r.erreur}`); return; }
    if (r.avertissement) alert(`Le mail est bien parti, mais la date d'envoi n'a pas pu être notée sur la visite.\n\nLance le SQL rappel-visites.sql dans Supabase.\n\n${r.avertissement}`);
    onEnvoye();
  }

  if (!monte) return null;
  const titreJour = date ? jourLong(depuisCle(date)) : '';
  const libelle: React.CSSProperties = { fontSize: 11, fontWeight: 800, color: PALE, textTransform: 'uppercase', letterSpacing: .8 };
  const champ: React.CSSProperties = { width: '100%', boxSizing: 'border-box', background: '#f8fafc', border: `1.5px solid ${BORD}`, borderRadius: 10, padding: '10px 12px', fontSize: 13.5, fontFamily: 'inherit', color: NAVY, outline: 'none' };

  return createPortal(
    <div className="crm-voile"
      style={{ position: 'fixed', inset: 0, zIndex: 10050, background: 'rgba(15,22,35,0.55)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20, backdropFilter: 'blur(4px)', fontFamily: "'DM Sans', system-ui, sans-serif", color: NAVY }}>
      <div className="crm-feuille" role="dialog" aria-label="Rappel de visite"
        style={{ background: 'white', borderRadius: 20, width: '100%', maxWidth: 560, maxHeight: 'calc(100dvh - 40px)', display: 'flex', flexDirection: 'column', boxShadow: '0 24px 48px rgba(0,0,0,0.18)', overflow: 'hidden' }}>
        <div style={{ padding: '18px 22px 14px', borderBottom: '1px solid #f1f5f9', display: 'flex', alignItems: 'center', gap: 12 }}>
          <span style={{ width: 38, height: 38, borderRadius: 11, background: '#fbf4e1', color: '#8a6a1f', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M3 7.2a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v9.6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" /><path d="m3.6 7.6 8.4 5.8 8.4-5.8" /></svg>
          </span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <h2 style={{ fontFamily: "'Plus Jakarta Sans',sans-serif", fontWeight: 800, fontSize: 17, margin: 0 }}>Envoyer le rappel de visite</h2>
            {client && <div style={{ fontSize: 12.5, color: DOUX, marginTop: 2 }}>{`${client.prenom} ${client.nom}`.trim() + (titreJour ? ` · ${titreJour}` : '')}</div>}
          </div>
          <button type="button" onClick={onFerme} aria-label="Fermer" style={{ width: 32, height: 32, borderRadius: 9, border: `1px solid ${BORD}`, background: 'white', cursor: 'pointer', color: DOUX, fontSize: 14 }}>✕</button>
        </div>

        <div style={{ padding: '16px 22px', display: 'flex', flexDirection: 'column', gap: 16, overflowY: 'auto', flex: 1 }}>
          {chargement ? (
            <div style={{ color: PALE, fontSize: 13.5, padding: '20px 0' }}>Chargement…</div>
          ) : erreur ? (
            <div style={{ color: '#b42318', fontSize: 13.5 }}>{erreur}</div>
          ) : (
            <>
              {dejaEnvoye && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '9px 12px', borderRadius: 11, background: '#ecfdf5', color: '#065f46', fontSize: 12.5, fontWeight: 700 }}>
                  <span aria-hidden="true">✓</span><span>{`${libelleRappel(dejaEnvoye)}. Tu peux le renvoyer.`}</span>
                </div>
              )}

              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <span style={libelle}>{lignes.length > 1 ? `Les ${lignes.length} visites de ce jour-là` : 'La visite'}</span>
                {lignes.map(l => {
                  const actif = !!coches[l.id];
                  return (
                    <button key={l.id} type="button" aria-pressed={actif} onClick={() => lignes.length > 1 && setCoches(c => ({ ...c, [l.id]: !c[l.id] }))}
                      style={{ display: 'flex', alignItems: 'center', gap: 12, width: '100%', padding: 8, borderRadius: 13, border: `1.5px solid ${actif ? OR : BORD}`, background: actif ? '#fffaf0' : 'white', cursor: lignes.length > 1 ? 'pointer' : 'default', textAlign: 'left', fontFamily: 'inherit', color: NAVY, opacity: actif ? 1 : .6 }}>
                      {l.photo
                        ? <img src={l.photo} alt="" style={{ width: 52, height: 42, borderRadius: 8, objectFit: 'cover', flexShrink: 0 }} />
                        : <span style={{ width: 52, height: 42, borderRadius: 8, background: NAVY, flexShrink: 0 }} />}
                      <span style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0, flex: 1 }}>
                        <b style={{ fontSize: 13.5, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{`${l.heure ? heureFr(l.heure) : 'Heure à confirmer'} · ${l.titre}`}</b>
                        <span style={{ fontSize: 12, color: l.lieu ? DOUX : '#b45309', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{l.lieu || 'Pas d’adresse sur le bien'}</span>
                      </span>
                      {lignes.length > 1 && (
                        <span style={{ width: 22, height: 22, borderRadius: 7, border: `1.5px solid ${actif ? OR : '#cbd3df'}`, background: actif ? OR : 'white', color: NAVY, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, fontSize: 13, fontWeight: 900 }}>{actif ? '✓' : ''}</span>
                      )}
                    </button>
                  );
                })}
                {lignes.length > 1 && <span style={{ fontSize: 12, color: PALE }}>Décoche une visite pour ne pas la mettre dans le mail.</span>}
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <span style={libelle}>À</span>
                {client && client.emails.length > 0
                  ? <span style={{ fontSize: 13.5, fontWeight: 600, overflowWrap: 'anywhere' }}>{client.emails.join(', ')}</span>
                  : <span style={{ fontSize: 13.5, color: '#b42318', fontWeight: 600 }}>Pas d’adresse mail dans la fiche du client.</span>}
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <span style={libelle}>Objet</span>
                <input value={objet} onChange={e => { setRetouche(true); setObjet(e.target.value); }} style={champ} aria-label="Objet du mail" />
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <span style={libelle}>Message</span>
                <textarea value={corps} onChange={e => { setRetouche(true); setCorps(e.target.value); }} rows={Math.min(14, Math.max(8, corps.split('\n').length + 1))} style={{ ...champ, resize: 'vertical', lineHeight: 1.55 }} aria-label="Message" />
                <span style={{ fontSize: 12, color: PALE }}>{choisies.length > 1 ? 'Sous le message, le mail montre chaque visite avec son heure, sa photo, son adresse et l’itinéraire.' : 'Sous le message, le mail montre la visite avec son heure, sa photo, son adresse et l’itinéraire.'}</span>
                {retouche && propose && (
                  <button type="button" onClick={() => setRetouche(false)} style={{ alignSelf: 'flex-start', background: 'none', border: 'none', padding: 0, color: '#8a6a1f', fontSize: 12.5, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>Remettre le texte proposé</button>
                )}
              </div>
            </>
          )}
        </div>

        <div className="crm-pied" style={{ padding: '14px 22px', borderTop: '1px solid #f1f5f9', display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <button type="button" onClick={onFerme} style={{ padding: '9px 16px', borderRadius: 10, border: `1px solid ${BORD}`, background: 'white', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', color: NAVY }}>Annuler</button>
          <button type="button" onClick={envoyer} disabled={envoi || chargement || !!erreur || !choisies.length || !client?.emails.length}
            style={{ padding: '9px 18px', borderRadius: 10, border: 'none', background: NAVY, color: 'white', fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', opacity: envoi || chargement || !!erreur || !choisies.length || !client?.emails.length ? .5 : 1 }}>
            {envoi ? 'Envoi…' : choisies.length > 1 ? `Envoyer le rappel (${choisies.length} visites)` : 'Envoyer le rappel'}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
