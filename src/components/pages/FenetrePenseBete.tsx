'use client';
/* ═══ « Nouvelle relance » : le pense-bête (V3.165) ═══════════════════════

   Alexandre : « créer une relance moi-même, en note libre, un pense-bête…
   je mets la date et ça arrive dans les relances comme les clients ». Ça
   évite de passer par l'agenda pour un appel à ne pas oublier.

   Pour un contact (on le cherche par son nom) ou pour personne en
   particulier. La relance est une relance « manuelle » ordinaire, dont la
   note commence par « Pense-bête — » : la page Relances lui donne son
   étiquette, et « C'est fait » / « Reporter » marchent comme pour les autres.

   ⚠️ Sans contact, `relances.client_id` reste vide : il faut que la colonne
   l'accepte (outils/sql/relances-pense-bete.sql). */

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { supabase } from '@/lib/supabase';
import { signalerEchec } from '@/lib/ecritures';
import { ChoixJour } from './PageAgenda';
import AvatarContact from '@/components/contacts/AvatarContact';
import { Icone } from '@/components/fiche/ParcoursBien';
import s from './FenetrePenseBete.module.css';

export const DEBUT_PENSE_BETE = 'Pense-bête — ';

type Contact = { id: string; prenom?: string | null; nom?: string | null; telephones?: string[] | null; emails?: string[] | null };

const pad = (n: number) => String(n).padStart(2, '0');
const jourDans = (n: number) => { const d = new Date(); d.setHours(12, 0, 0, 0); d.setDate(d.getDate() + n); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };
const sansAccents = (t: string) => t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const nomDe = (c: Contact) => `${c.prenom || ''} ${c.nom || ''}`.trim() || 'Contact sans nom';

const JOURS: { lib: string; n: number; ic: string }[] = [
  { lib: 'Aujourd’hui', n: 0, ic: 'soleil' }, { lib: 'Demain', n: 1, ic: 'horloge' },
  { lib: 'Dans 3 jours', n: 3, ic: 'calendrier' }, { lib: 'Dans une semaine', n: 7, ic: 'calendrier' },
];
const court = (k: string) => new Date(`${k}T12:00:00`).toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short' });

export default function FenetrePenseBete({ onFermer, onCree }: {
  onFermer: () => void;
  /** la relance posée, et son jour (AAAA-MM-JJ) */
  onCree: (id: string, jour: string) => void;
}) {
  const [monte, setMonte] = useState(false);
  const [q, setQ] = useState('');
  const [trouves, setTrouves] = useState<Contact[]>([]);
  const [cherche, setCherche] = useState(false);
  const [contact, setContact] = useState<Contact | null>(null);
  const [texte, setTexte] = useState('');
  const [jour, setJour] = useState(jourDans(0));
  const [envoi, setEnvoi] = useState(false);
  const [erreur, setErreur] = useState('');

  useEffect(() => { setMonte(true); }, []);
  useEffect(() => {
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') onFermer(); };
    window.addEventListener('keydown', esc);
    return () => window.removeEventListener('keydown', esc);
  }, [onFermer]);

  /* La recherche d'un contact : son prénom ou son nom, plusieurs mots possibles. */
  useEffect(() => {
    const mots = sansAccents(q).split(/[\s,;]+/).filter(Boolean);
    if (!mots.length) { setTrouves([]); setCherche(false); return; }
    const t = setTimeout(async () => {
      const m = mots[0].replace(/[,()"%*]/g, '');
      const { data } = await supabase.from('clients').select('id, prenom, nom, telephones, emails')
        .or(`prenom.ilike.%${m}%,nom.ilike.%${m}%`).limit(30);
      const liste = ((data || []) as Contact[])
        .filter(c => mots.every(w => sansAccents(`${c.prenom || ''} ${c.nom || ''}`).includes(w)))
        .slice(0, 6);
      setTrouves(liste);
      setCherche(true);
    }, 220);
    return () => clearTimeout(t);
  }, [q]);

  async function creer() {
    const note = texte.trim();
    if (!note || envoi) return;
    setEnvoi(true);
    setErreur('');
    /* La relance d'un contact appartient à sa recherche ouverte, s'il en a une. */
    let rechercheId: string | null = null;
    if (contact) {
      const { data } = await supabase.from('recherches').select('id').eq('client_id', contact.id).eq('active', true)
        .order('updated_at', { ascending: false }).limit(1);
      rechercheId = (data && data[0]?.id) || null;
    }
    const { data, error } = await supabase.from('relances').insert({
      client_id: contact?.id || null, recherche_id: rechercheId, type: 'manuelle', statut: 'en_attente',
      date_echeance: new Date(`${jour}T12:00:00`).toISOString(), note: `${DEBUT_PENSE_BETE}${note}`,
    }).select('id').single();
    if (error || !data) {
      setEnvoi(false);
      const msg = error?.message || '';
      setErreur(/client_id/i.test(msg) && !contact
        ? 'Un pense-bête sans contact n’est pas encore accepté par la base : il faut passer le petit SQL outils/sql/relances-pense-bete.sql dans Supabase. En attendant, choisis un contact.'
        : `La relance n’a pas été enregistrée.${msg ? ` (${msg})` : ''}`);
      /* Le message rouge habituel, en plus du mot dans la fenêtre. */
      signalerEchec('La relance', msg || 'aucune ligne écrite');
      return;
    }
    setEnvoi(false);
    onCree(data.id, jour);
  }

  if (!monte) return null;

  return createPortal(
    <div className={s.voile} onClick={e => { if (e.target === e.currentTarget) onFermer(); }}>
      <section className={s.fenetre} role="dialog" aria-modal="true" aria-label="Nouvelle relance">
        <div className={s.tete}>
          <span className={s.ic}><Icone nom="note" taille={20} epaisseur={2} /></span>
          <div>
            <h2>Nouvelle relance ou pense-bête</h2>
            <p>Il arrive dans tes relances le jour choisi, comme celles de tes clients.</p>
          </div>
          <button type="button" className={s.fermer} onClick={onFermer} aria-label="Fermer"><Icone nom="fermer" taille={16} epaisseur={2.4} /></button>
        </div>

        <div className={s.corps}>
          <div className={s.bloc}>
            <span className={s.titre}><span className={s.titreIc}><Icone nom="clients" taille={15} epaisseur={2} /></span>Pour qui ?<small>facultatif</small></span>
            {contact ? (
              <div className={s.choisi}>
                <AvatarContact c={contact} teinte={{ bg: '#34496e', fg: '#c9a84c' }} taille={34} />
                <span><b>{nomDe(contact)}</b><br /><span>{(contact.telephones || [])[0] || (contact.emails || [])[0] || ''}</span></span>
                <button type="button" className={s.retirer} onClick={() => { setContact(null); setQ(''); }}>Changer</button>
              </div>
            ) : (
              <>
                <label className={s.champ}>
                  <Icone nom="loupe" taille={16} epaisseur={2} />
                  <input value={q} onChange={e => setQ(e.target.value)} placeholder="Chercher un contact par son nom" aria-label="Chercher un contact" />
                </label>
                {cherche && (
                  <div className={s.resultats}>
                    {trouves.length ? trouves.map(c => (
                      <button key={c.id} type="button" className={s.resultat} onClick={() => { setContact(c); setTrouves([]); setCherche(false); }}>
                        <AvatarContact c={c} teinte={{ bg: '#34496e', fg: '#c9a84c' }} taille={32} />
                        <span><b>{nomDe(c)}</b><span>{(c.telephones || [])[0] || (c.emails || [])[0] || ''}</span></span>
                      </button>
                    )) : <div className={s.rien}>Aucun contact à ce nom. Laisse vide pour un pense-bête sans contact.</div>}
                  </div>
                )}
              </>
            )}
          </div>

          <div className={s.bloc}>
            <span className={s.titre}><span className={s.titreIc}><Icone nom="note" taille={15} epaisseur={2} /></span>Quoi ?</span>
            <textarea className={s.texte} value={texte} onChange={e => setTexte(e.target.value)} autoFocus
              aria-label="Ce qu’il faut faire"
              placeholder="Ex : rappeler l’agence pour les diagnostics, lui demander s’il a vu le 4 pièces…" />
          </div>

          <div className={s.bloc}>
            <span className={s.titre}><span className={s.titreIc}><Icone nom="calendrier" taille={15} epaisseur={2} /></span>Quand ?</span>
            <div className={s.jours}>
              {JOURS.map(j => {
                const k = jourDans(j.n);
                return (
                  <button key={j.lib} type="button" className={s.jour} aria-pressed={jour === k} onClick={() => setJour(k)}>
                    <span className={s.jourIc}><Icone nom={j.ic} taille={16} epaisseur={2} /></span>
                    <span><b>{j.lib}</b><small>{court(k)}</small></span>
                  </button>
                );
              })}
            </div>
            <ChoixJour date={jour} min={jourDans(0)} onDate={setJour} etiquette="Le jour de la relance" />
          </div>
        </div>

        {erreur && <div className={s.erreur} role="alert">{erreur}</div>}

        <div className={s.pied}>
          <button type="button" className={s.bouton} onClick={onFermer}>Annuler</button>
          <button type="button" className={s.bouton} data-ton="navy" onClick={() => { void creer(); }} disabled={!texte.trim() || envoi}>
            <Icone nom="coche" taille={16} epaisseur={2.4} />{envoi ? 'Un instant…' : 'Créer la relance'}
          </button>
        </div>
      </section>
    </div>,
    document.body,
  );
}
