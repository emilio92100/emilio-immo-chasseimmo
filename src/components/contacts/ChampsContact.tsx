'use client';
import { useEffect, useState, type ReactNode } from 'react';
import { supabase } from '@/lib/supabase';
import { euros } from '@/lib/mandat';
import { nomFoyer } from '@/lib/foyer';
import { demanderNouveauBien } from '@/lib/intentions';
import {
  METIERS, STATUTS_PRO, TYPES_CONTACT, colonneContactAbsente, ligneContact, typeDe, typesDe,
  type InfosPro, type TypeContact,
} from '@/lib/contacts';
import { etapeDe } from '@/lib/biens-vente';
import { Ic } from '@/components/documents/ApercuActe';
import BlocRepliable from '@/components/documents/BlocRepliable';
import sd from '@/components/documents/Documents.module.css';
import c from './Contacts.module.css';

/* ═══ Les morceaux des contacts ════════════════════════════════════════════
   Partagés par la liste, la création d'un contact, sa fiche et la fiche
   d'un acheteur : les types à cocher, les champs d'un professionnel, les
   pastilles de type (modifiables), la carte de la liste, et « Ses biens ».
   Tous au niveau du module (AGENTS.md §2.4). */

/* ── Les types, à cocher (plusieurs à la fois) ── */
export function ChoixTypes({ v, onChange }: { v: TypeContact[]; onChange: (x: TypeContact[]) => void }) {
  const basculer = (k: TypeContact) => onChange(v.includes(k) ? v.filter(x => x !== k) : TYPES_CONTACT.map(t => t.k).filter(x => x === k || v.includes(x)));
  return (
    <div className={c.types} role="group" aria-label="Type de contact">
      {TYPES_CONTACT.map(t => {
        const on = v.includes(t.k);
        return (
          <button key={t.k} type="button" className={`${c.type} ${on ? c.typeOn : ''}`} aria-pressed={on} onClick={() => basculer(t.k)}>
            <span className={c.typeIc} style={{ background: t.fond, color: t.c }}><Ic n={t.ic} t={19} /></span>
            <span><b>{t.lib}</b><small>{t.aide}</small></span>
            <span className={c.typeCoche}>{on && <Ic n="check" t={12} e={3} />}</span>
          </button>
        );
      })}
    </div>
  );
}

/* ── Une pastille de type ── */
export function Puce({ k }: { k: TypeContact }) {
  const t = typeDe(k);
  return <span className={c.puce} style={{ background: t.fond, color: t.c, borderColor: `${t.c}33` }}><Ic n={t.ic} t={12} />{t.lib}</span>;
}

/* ── Les pastilles, et de quoi les changer sans ouvrir de formulaire ──
   Enregistre tout de suite. `onMaj` reçoit la fiche à jour. */
export function TypesEnLigne({ client, sombre = false, onMaj }: {
  client: { id: string; types?: unknown }; sombre?: boolean; onMaj?: (types: TypeContact[]) => void;
}) {
  const [types, setTypes] = useState<TypeContact[]>(() => typesDe(client));
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null);
  const [erreur, setErreur] = useState('');
  async function basculer(k: TypeContact) {
    const n = types.includes(k) ? types.filter(x => x !== k) : TYPES_CONTACT.map(t => t.k).filter(x => x === k || types.includes(x));
    if (!n.length) return;
    setErreur('');
    const { error } = await supabase.from('clients').update({ types: n }).eq('id', client.id);
    if (error) { setErreur(colonneContactAbsente(error.message) ? 'Lance d’abord outils/sql/types-contact.sql dans Supabase.' : error.message); return; }
    setTypes(n);
    onMaj?.(n);
  }
  return (
    <span className={`${c.puces} ${sombre ? c.pucesSombre : ''}`}>
      {types.map(k => <Puce key={k} k={k} />)}
      <button type="button" className={c.modifTypes} onClick={e => {
        const r = e.currentTarget.getBoundingClientRect();
        setMenu(menu ? null : { x: Math.max(12, Math.min(r.left, window.innerWidth - 352)), y: r.bottom + 6 });
      }}>{types.length ? 'Changer' : 'Choisir le type'}</button>
      {menu && (
        <>
          <span className={c.voile} onClick={() => setMenu(null)} />
          <span className={c.popTypes} style={{ left: menu.x, top: menu.y }} role="menu">
            <span className={c.popT} style={{ display: 'block' }}>Ce contact est…</span>
            {TYPES_CONTACT.map(t => {
              const on = types.includes(t.k);
              return (
                <button key={t.k} type="button" role="menuitemcheckbox" aria-checked={on} className={c.popL} onClick={() => basculer(t.k)}>
                  <span className={`${c.popCase} ${on ? c.popCaseOn : ''}`}>{on && <Ic n="check" t={12} e={3} />}</span>
                  <span className={c.typeIc} style={{ background: t.fond, color: t.c, width: 28, height: 28, borderRadius: 9 }}><Ic n={t.ic} t={15} /></span>
                  <b>{t.lib}</b>
                </button>
              );
            })}
            {erreur && <span className={c.popErreur} style={{ display: 'block' }}>{erreur}</span>}
          </span>
        </>
      )}
    </span>
  );
}

/* ── Les champs d'un professionnel, selon ses types ──
   `cls` : les classes du formulaire qui les accueille (la création d'un
   contact a les siennes). */
type Cls = { row: string; group: string; label: string; input: string; bloc?: (titre: string, enfants: ReactNode) => ReactNode };
function Champ({ cls, lib, v, onV, ph }: { cls: Cls; lib: string; v?: string; onV: (x: string) => void; ph?: string }) {
  return (
    <label className={cls.group}>
      <span className={cls.label}>{lib}</span>
      <input className={cls.input} value={v || ''} placeholder={ph} onChange={e => onV(e.target.value)} />
    </label>
  );
}
export function ChampsPro({ types, pro, onChange, cls }: { types: TypeContact[]; pro: InfosPro; onChange: (p: InfosPro) => void; cls: Cls }) {
  const set = (k: keyof InfosPro) => (x: string) => onChange({ ...pro, [k]: x });
  const bloc = cls.bloc || ((titre: string, enfants: ReactNode) => <div className={c.groupe}><div className={c.groupeT}>{titre}</div>{enfants}</div>);
  return (
    <>
      {types.includes('confrere') && bloc('Son agence', (
        <div className={c.pro}>
          <div className={c.pills} role="radiogroup" aria-label="Son statut">
            {STATUTS_PRO.map(s => (
              <button key={s.v} type="button" role="radio" aria-checked={pro.statutPro === s.v} className={`${c.pill} ${pro.statutPro === s.v ? c.pillOn : ''}`}
                onClick={() => onChange({ ...pro, statutPro: pro.statutPro === s.v ? '' : s.v })}>
                {s.l}<small>{s.aide}</small>
              </button>
            ))}
          </div>
          <div className={cls.row}>
            <Champ cls={cls} lib={pro.statutPro === 'mandataire' ? 'Son nom commercial ou son agence' : 'L’agence'} v={pro.agence} onV={set('agence')} ph="Ex : Agence du Parc" />
            {pro.statutPro === 'mandataire'
              ? <Champ cls={cls} lib="Son réseau" v={pro.reseau} onV={set('reseau')} ph="IAD, SAFTI, Capifrance…" />
              : <Champ cls={cls} lib="Site internet" v={pro.siteWeb} onV={set('siteWeb')} ph="facultatif" />}
          </div>
          <Champ cls={cls} lib="Adresse de l’agence" v={pro.adresseAgence} onV={set('adresseAgence')} ph="12 avenue Victor Hugo, 92100 Boulogne-Billancourt" />
        </div>
      ))}
      {types.includes('notaire') && bloc('Son étude', (
        <div className={c.pro}>
          <div className={cls.row}>
            <Champ cls={cls} lib="L’étude" v={pro.etude} onV={set('etude')} ph="Ex : Étude Durand & associés" />
            <Champ cls={cls} lib="Adresse de l’étude" v={pro.adresseEtude} onV={set('adresseEtude')} ph="3 rue de Paris, 92100 Boulogne" />
          </div>
          <div className={cls.row}>
            <Champ cls={cls} lib="Son clerc ou assistant(e)" v={pro.clerc} onV={set('clerc')} ph="facultatif" />
            <Champ cls={cls} lib="Son téléphone" v={pro.clercTel} onV={set('clercTel')} ph="facultatif" />
          </div>
        </div>
      ))}
      {types.includes('gardien') && bloc('L’immeuble', (
        <div className={c.pro}>
          <Champ cls={cls} lib="L’immeuble" v={pro.immeuble} onV={set('immeuble')} ph="Ex : 12 rue de Silly, 92100 Boulogne" />
          <div className={cls.row}>
            <Champ cls={cls} lib="Horaires de la loge" v={pro.horaires} onV={set('horaires')} ph="Ex : 8 h – 12 h, 15 h – 19 h" />
            <Champ cls={cls} lib="Accès, clés" v={pro.acces} onV={set('acces')} ph="Ex : loge au fond de la cour" />
          </div>
        </div>
      ))}
      {types.includes('partenaire') && bloc('Son activité', (
        <div className={c.pro}>
          <div className={c.pills}>
            {METIERS.map(m => (
              <button key={m} type="button" className={`${c.pill} ${pro.metier === m ? c.pillOn : ''}`} onClick={() => onChange({ ...pro, metier: pro.metier === m ? '' : m })}>{m}</button>
            ))}
          </div>
          <div className={cls.row}>
            <Champ cls={cls} lib="Son métier" v={pro.metier} onV={set('metier')} ph="Ou écris-le" />
            <Champ cls={cls} lib="Sa société" v={pro.societe} onV={set('societe')} ph="facultatif" />
          </div>
        </div>
      ))}
    </>
  );
}

/* ── Les biens d'un contact (rubrique Biens) ── */
export type BienDuContact = { id: string; client_id: string | null; etape: string; titre: string | null; ville: string | null; prix: number | null; archive?: boolean | null };
export function LigneBien({ b, onClick }: { b: BienDuContact; onClick: () => void }) {
  const e = etapeDe(b.etape);
  return (
    <button type="button" className={c.bienMini} onClick={ev => { ev.stopPropagation(); onClick(); }}>
      <Ic n="maison" t={14} />
      <span><b>{b.titre || 'Bien'}</b>{(b.ville || b.prix) && <small>{[b.ville, b.prix ? euros(b.prix) : ''].filter(Boolean).join(' · ')}</small>}</span>
      <span className={c.etapeB} style={{ color: e.c }}><span className={c.point} style={{ background: e.c, display: 'inline-block', marginRight: 5 }} />{e.court}</span>
    </button>
  );
}

/* « Ses biens » sur une fiche : lus dans la rubrique Biens, avec « Créer un
   bien » qui ouvre la rubrique, ce contact déjà propriétaire. Un bloc qui se
   replie (V3.17) : replié sur la fiche d'un acheteur, ouvert sur celle d'un
   vendeur (`ouvertAuDebut`). */
export function BiensDuContact({ clientId, prenom, onNavigate, toujours = false, ouvertAuDebut = false }: {
  clientId: string; prenom: string; onNavigate: (page: string, data?: unknown) => void; toujours?: boolean; ouvertAuDebut?: boolean;
}) {
  const [biens, setBiens] = useState<BienDuContact[] | null>(null);
  useEffect(() => {
    let vivant = true;
    supabase.from('biens_vente').select('id, client_id, etape, titre, ville, prix, archive').eq('client_id', clientId).order('updated_at', { ascending: false })
      .then(({ data, error }) => { if (vivant) setBiens(error ? [] : (data || []) as BienDuContact[]); });
    return () => { vivant = false; };
  }, [clientId]);
  if (!biens || (!biens.length && !toujours)) return null;
  return (
    <BlocRepliable ic="maison" titre="Ses biens" n={biens.length} ouvertAuDebut={ouvertAuDebut}
      resume={biens.length ? biens.slice(0, 2).map(x => { const e = etapeDe(x.etape); return <span key={x.id} style={{ background: '#f4f7fb', color: e.c }}><span className={c.point} style={{ background: e.c }} />{e.court}</span>; }) : undefined}
      action={<button type="button" className={c.lien} onClick={() => { demanderNouveauBien(clientId); onNavigate('biens'); }}>+ Créer<span className={sd.rpLong}> un bien</span></button>}>
      {biens.length ? (
        <div className={c.biensMini} style={{ borderTop: 'none', paddingTop: 0 }}>
          {biens.map(b => <LigneBien key={b.id} b={b} onClick={() => onNavigate('biens', { bien: b.id })} />)}
        </div>
      ) : <div className={c.pied}>{`Aucun bien pour l’instant. « Créer un bien » ouvre la rubrique Biens, ${prenom || 'ce contact'} déjà propriétaire : estimation, mandat, tout y est.`}</div>}
    </BlocRepliable>
  );
}

/* ── La liste des contacts : une ligne par contact, la même pour tous ──
   Qui c'est (avatar à la couleur de son type), ses types, ce qu'on suit
   avec lui (sa recherche, son bien, son agence, son étude…), comment le
   joindre, et depuis quand on ne s'est rien dit. L'onglet « Acheteurs »
   garde son tableau détaillé ; « Tous » et les autres types, cette liste. */
type ContactListe = {
  id: string; prenom: string; nom: string; reference?: string | null; couple?: boolean | null; conjoint?: unknown;
  types?: unknown; pro?: unknown; adresse?: string | null; emails?: string[] | null; telephones?: string[] | null; archive?: boolean | null;
  type_bien?: string | null; nb_pieces_min?: number | null; surface_min?: number | null; budget_max?: number | null; secteurs?: string[] | null;
};
const court = (n: number) => n >= 1e6 ? `${(n / 1e6).toLocaleString('fr-FR', { maximumFractionDigits: 2 })} M€` : `${Math.round(n / 1000)} k€`;
/* « aujourd'hui », « hier », « il y a 3 j », « il y a 2 sem. », « il y a 4 mois ». */
export function depuis(iso?: string | null): string {
  if (!iso) return '';
  const j = Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
  if (Number.isNaN(j)) return '';
  if (j <= 0) return 'aujourd’hui';
  if (j === 1) return 'hier';
  if (j < 14) return `il y a ${j} j`;
  if (j < 60) return `il y a ${Math.floor(j / 7)} sem.`;
  if (j < 365) return `il y a ${Math.floor(j / 30)} mois`;
  const a = Math.floor(j / 365);
  return `il y a ${a} an${a > 1 ? 's' : ''}`;
}
/* Sa recherche en une ligne : « Appartement · 4 p. · 85 m² · 1 M€ · Boulogne +1 ». */
function resumeRecherche(x: ContactListe): string {
  const sect = (x.secteurs || []).filter(Boolean);
  return [
    x.type_bien ? String(x.type_bien).split(',').map(t => t.trim()).filter(Boolean).join(' ou ') : '',
    x.nb_pieces_min ? `${x.nb_pieces_min} p.` : '',
    x.surface_min ? `${x.surface_min} m²` : '',
    x.budget_max ? court(x.budget_max) : '',
    sect.length ? `${sect[0]}${sect.length > 1 ? ` +${sect.length - 1}` : ''}` : '',
  ].filter(Boolean).join(' · ');
}

export function EnteteContacts() {
  return (
    <div className={c.lEntete}>
      <span className={c.lQui}>Contact</span>
      <span className={c.lSuivi}>Ce qu’on suit</span>
      <span className={c.lJoindre}>Le joindre</span>
      <span className={c.lDepuis}>Dernier échange</span>
    </div>
  );
}

export function LigneContact({ x, biens, derniere, onOuvrir, onBien }: {
  x: ContactListe; biens: BienDuContact[]; derniere?: string | null; onOuvrir: () => void; onBien: (id: string) => void;
}) {
  const types = typesDe(x);
  const t = typeDe(types.find(k => k !== 'acheteur') || types[0]);
  const principal = types.includes('acheteur') ? typeDe('acheteur') : t;
  const tel = x.telephones?.[0], mail = x.emails?.[0];
  const initiales = `${(x.prenom || x.nom || '?')[0]}${x.prenom && x.nom ? x.nom[0] : ''}`.toUpperCase();
  const pro = ligneContact(x);
  const recherche = types.includes('acheteur') ? resumeRecherche(x) : '';
  const vend = types.includes('vendeur') || types.includes('proprietaire');
  const nom = nomFoyer(x) || 'Sans nom';
  return (
    <div role="button" tabIndex={0} className={`${c.lLigne} ${x.archive ? c.lArchive : ''}`} onClick={onOuvrir} onKeyDown={e => { if (e.key === 'Enter') onOuvrir(); }}>
      <span className={c.lQui}>
        <span className={c.lAv} style={{ background: principal.fond, color: principal.c, boxShadow: `inset 0 0 0 2px ${principal.c}33` }}>{initiales}</span>
        <span className={c.lNom}>
          <b title={nom}>{nom}</b>
          <span className={c.puces}>{types.map(k => <Puce key={k} k={k} />)}</span>
        </span>
      </span>
      <span className={c.lSuivi}>
        {types.includes('acheteur') && (
          <span className={c.lInfo}>
            <span className={c.lInfoIc} style={{ color: typeDe('acheteur').c }}><Ic n="cible" t={14} /></span>
            {recherche ? <span className={c.lTxt}>{recherche}</span> : <span className={c.lAFaire}>Critères à remplir</span>}
          </span>
        )}
        {vend && biens.slice(0, 2).map(b => {
          const e = etapeDe(b.etape);
          return (
            <button key={b.id} type="button" className={c.lInfo} onClick={ev => { ev.stopPropagation(); onBien(b.id); }} title="Ouvrir le bien">
              <span className={c.lInfoIc} style={{ color: typeDe('vendeur').c }}><Ic n="maison" t={14} /></span>
              <span className={c.lTxt}>{[b.titre || 'Bien', b.ville].filter(Boolean).join(' · ')}</span>
              <span className={c.lEtape} style={{ color: e.c, background: `${e.c}14` }}><i style={{ background: e.c }} />{e.court}</span>
            </button>
          );
        })}
        {vend && biens.length > 2 && <span className={c.lPlus}>{`+ ${biens.length - 2} autre${biens.length > 3 ? 's' : ''} bien${biens.length > 3 ? 's' : ''}`}</span>}
        {vend && !biens.length && !types.includes('acheteur') && <span className={c.lInfo}><span className={c.lInfoIc} style={{ color: '#b8c2d1' }}><Ic n="maison" t={14} /></span><span className={c.lAFaire}>Pas encore de bien</span></span>}
        {pro && (
          <span className={c.lInfo}>
            <span className={c.lInfoIc} style={{ color: t.c }}><Ic n={t.ic} t={14} /></span>
            <span className={c.lTxt}>{pro}</span>
          </span>
        )}
      </span>
      <span className={c.lJoindre}>
        {tel && <a href={`tel:${tel.replace(/\s+/g, '')}`} onClick={e => e.stopPropagation()}><Ic n="telephone" t={13} /><span>{tel}</span></a>}
        {mail && <a href={`mailto:${mail}`} onClick={e => e.stopPropagation()}><Ic n="mail" t={13} /><span>{mail}</span></a>}
        {!tel && !mail && <em>Aucune coordonnée</em>}
      </span>
      <span className={c.lDepuis}>{depuis(derniere)}</span>
    </div>
  );
}
