'use client';
import { useEffect, useState, type ReactNode } from 'react';
import { supabase } from '@/lib/supabase';
import { euros } from '@/lib/mandat';
import { nomFoyer } from '@/lib/foyer';
import { demanderNouveauBien } from '@/lib/intentions';
import {
  FORMES_SOCIETE, METIERS, STATUTS_PRO, TYPES_CONTACT, colonneContactAbsente, ligneContact, typeDe, typesDe,
  type InfosPro, type TypeContact,
} from '@/lib/contacts';
import { etapeDe, lirePhotos, specsBien, titreBien } from '@/lib/biens-vente';
import { Ic } from '@/components/documents/ApercuActe';
import BlocRepliable from '@/components/documents/BlocRepliable';
import AvatarContact from './AvatarContact';
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
/* « Il achète lui-même », « Il vend lui-même »… selon ses types (V3.31). */
const enSonNom = (t: TypeContact[]) => {
  const verbes = [t.includes('acheteur') && 'achète', t.includes('vendeur') && 'vend', t.includes('proprietaire') && !t.includes('vendeur') && 'possède son bien'].filter(Boolean) as string[];
  return `Il ${verbes.length > 1 ? `${verbes.slice(0, -1).join(', ')} et ${verbes[verbes.length - 1]}` : verbes[0] || 'agit'} lui-même`;
};
/* Une société cochée « Pour une société », encore vide (V3.31). */
const SOCIETE_VIDE = { denomination: '', forme: 'SCI', rcs: '', siege: '', qualite: '' };

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
            <Champ cls={cls} lib={pro.statutPro === 'mandataire' ? 'Son nom commercial ou son agence' : 'L’agence'} v={pro.agence} onV={set('agence')} />
            {pro.statutPro === 'mandataire'
              ? <Champ cls={cls} lib="Son réseau" v={pro.reseau} onV={set('reseau')} />
              : <Champ cls={cls} lib="Site internet · facultatif" v={pro.siteWeb} onV={set('siteWeb')} />}
          </div>
          <Champ cls={cls} lib="Adresse de l’agence" v={pro.adresseAgence} onV={set('adresseAgence')} />
        </div>
      ))}
      {types.includes('notaire') && bloc('Son étude', (
        <div className={c.pro}>
          <div className={cls.row}>
            <Champ cls={cls} lib="L’étude" v={pro.etude} onV={set('etude')} />
            <Champ cls={cls} lib="Adresse de l’étude" v={pro.adresseEtude} onV={set('adresseEtude')} />
          </div>
          <div className={cls.row}>
            <Champ cls={cls} lib="Son clerc ou assistant(e) · facultatif" v={pro.clerc} onV={set('clerc')} />
            <Champ cls={cls} lib="Son téléphone · facultatif" v={pro.clercTel} onV={set('clercTel')} />
          </div>
        </div>
      ))}
      {types.includes('gardien') && bloc('L’immeuble', (
        <div className={c.pro}>
          <Champ cls={cls} lib="Adresse de l’immeuble" v={pro.immeuble} onV={set('immeuble')} />
          <div className={cls.row}>
            <Champ cls={cls} lib="Horaires de la loge · facultatif" v={pro.horaires} onV={set('horaires')} />
            <Champ cls={cls} lib="Accès, clés · facultatif" v={pro.acces} onV={set('acces')} />
          </div>
        </div>
      ))}
      {/* Sa société (V3.31) : un acheteur, un vendeur, un propriétaire peut
          agir pour une SCI, une SARL… On la note dès la création ; les
          associés, le RCS et le siège se complètent ensuite sur sa fiche
          (« Sa société »). */}
      {(types.includes('acheteur') || types.includes('vendeur') || types.includes('proprietaire')) && bloc('Sa société', (
        <div className={c.pro}>
          <div className={c.pills} role="radiogroup" aria-label="Il agit en son nom ou pour une société">
            <button type="button" role="radio" aria-checked={!pro.structure} className={`${c.pill} ${!pro.structure ? c.pillOn : ''}`}
              onClick={() => onChange({ ...pro, structure: undefined })}>
              En son nom<small>{enSonNom(types)}</small>
            </button>
            <button type="button" role="radio" aria-checked={!!pro.structure} className={`${c.pill} ${pro.structure ? c.pillOn : ''}`}
              onClick={() => onChange({ ...pro, structure: pro.structure || { ...SOCIETE_VIDE, associes: [] } })}>
              Pour une société<small>Une SCI, une SARL… dont il est gérant ou associé</small>
            </button>
          </div>
          {pro.structure && (
            <>
              <div className={cls.row}>
                <Champ cls={cls} lib="Nom de la société" ph="SCI AVIENA" v={pro.structure.denomination} onV={x => onChange({ ...pro, structure: { ...pro.structure!, denomination: x } })} />
                <Champ cls={cls} lib="Son rôle · facultatif" ph="Gérant, associée…" v={pro.structure.qualite} onV={x => onChange({ ...pro, structure: { ...pro.structure!, qualite: x } })} />
              </div>
              <div className={c.pills} role="radiogroup" aria-label="La forme de la société">
                {FORMES_SOCIETE.map(f => (
                  <button key={f} type="button" role="radio" aria-checked={pro.structure?.forme === f} className={`${c.pill} ${pro.structure?.forme === f ? c.pillOn : ''}`}
                    onClick={() => onChange({ ...pro, structure: { ...pro.structure!, forme: pro.structure?.forme === f ? '' : f } })}>{f}</button>
                ))}
              </div>
              <div className={c.socAide}>Les associés, le RCS et le siège : sur sa fiche, dans « Sa société ».</div>
            </>
          )}
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
            <Champ cls={cls} lib="Son métier" v={pro.metier} onV={set('metier')} />
            <Champ cls={cls} lib="Sa société · facultatif" v={pro.societe} onV={set('societe')} />
          </div>
        </div>
      ))}
    </>
  );
}

/* ── Les biens d'un contact (rubrique Biens) ── */
export type BienDuContact = {
  id: string; client_id: string | null; etape: string; titre: string | null; ville: string | null; prix: number | null; archive?: boolean | null;
  /* Lus par « Ses biens » seulement (la liste des contacts n'en a pas besoin). */
  photo?: string | null; donnees?: Record<string, unknown> | null;
};
/* Un bien, déplié sous « Ses biens » : sa photo, de quoi le reconnaître
   (pièces, surface, ville, prix) et son étape. Un clic ouvre sa fiche. */
export function LigneBien({ b, onClick }: { b: BienDuContact; onClick: () => void }) {
  const e = etapeDe(b.etape);
  const d = (b.donnees || {}) as Parameters<typeof specsBien>[0];
  const photo = b.photo || lirePhotos((d as Record<string, unknown>).photos)[0]?.url || '';
  const titre = b.titre || titreBien(d);
  /* Les pièces et la surface, si le titre ne les dit pas déjà. */
  const surf = (d as Record<string, unknown>).surface;
  const specs = surf && titre.includes(String(surf)) ? '' : specsBien(d);
  const infos = [specs, b.ville, b.prix ? euros(b.prix) : ''].filter(Boolean).join(' · ');
  return (
    <button type="button" className={c.bienCarte} onClick={ev => { ev.stopPropagation(); onClick(); }} title="Ouvrir la fiche du bien">
      <span className={c.bienPhoto}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        {photo ? <img src={photo} alt="" /> : <Ic n="maison" t={18} />}
      </span>
      <span className={c.bienTxt}>
        <b>{titre || 'Bien'}</b>
        {infos && <small>{infos}</small>}
        <em style={{ color: e.c }}><i style={{ background: e.c }} />{e.court}</em>
      </span>
      <span className={c.bienVoir}><Ic n="droite" t={15} e={2.2} /></span>
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
    supabase.from('biens_vente').select('*').eq('client_id', clientId).order('updated_at', { ascending: false })
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
  id: string; prenom: string; nom: string; civilite?: string | null; reference?: string | null; couple?: boolean | null; conjoint?: unknown;
  types?: unknown; pro?: unknown; adresse?: string | null; emails?: string[] | null; telephones?: string[] | null; archive?: boolean | null;
  type_bien?: string | null; nb_pieces_min?: number | null; surface_min?: number | null; budget_max?: number | null; secteurs?: string[] | null;
};
/* Le montant en entier, jamais « 1,5 M€ » ni « 380 k€ » (V3.21). */
const court = (n: number) => `${Math.round(n).toLocaleString('fr-FR')} €`;
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
/* Sa recherche en une ligne : « Appartement · 4 p. · 85 m² · 1 000 000 € · Boulogne +1 ». */
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
  const pro = ligneContact(x);
  const recherche = types.includes('acheteur') ? resumeRecherche(x) : '';
  const vend = types.includes('vendeur') || types.includes('proprietaire');
  const nom = nomFoyer(x) || 'Sans nom';
  return (
    <div role="button" tabIndex={0} className={`${c.lLigne} ${x.archive ? c.lArchive : ''}`} onClick={onOuvrir} onKeyDown={e => { if (e.key === 'Enter') onOuvrir(); }}>
      <span className={c.lQui}>
        {/* Le même petit personnage que dans « Acheteurs » (V3.31), à la couleur
            de son type ; une mallette pour un professionnel. Avant : ses initiales. */}
        <AvatarContact c={x} teinte={{ bg: principal.fond, fg: principal.c, trait: `${principal.c}33` }} className={c.lAv} />
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
