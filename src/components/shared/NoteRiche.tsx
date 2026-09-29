'use client';
import { Fragment, useCallback, useMemo, useState, type ReactNode } from 'react';
import { Ic } from '@/components/documents/ApercuActe';
import n from './NoteRiche.module.css';

/* ═══ Un long texte libre, rangé en blocs (V3.30) ═══════════════════════════
   Les notes d'un bien, « À savoir » d'un contact, les remarques sur la
   copropriété : Alexandre (ou Claude, quand il remplit une fiche à partir des
   pièces) y écrit des paragraphes entiers. Affichés tels quels dans une
   colonne étroite, ils faisaient un mur de texte d'un mètre de haut.

   Ici, chaque paragraphe (séparé par une ligne vide) devient un bloc :
   · « Vendeur : SCI AVIENA… » en tête de paragraphe → le bloc s'appelle
     « Vendeur », et la suite est son texte ;
   · « Kbis du 29/07/2026 : il aura… » au début d'une ligne → le début en gras ;
   · « – Véronique… » → une ligne de liste ;
   · un e-mail ou un numéro de téléphone → un lien (écrire, appeler).
   Les blocs se rangent en colonnes quand il y a la place. Au-delà d'une
   certaine hauteur, le texte se replie : « Tout afficher » le déplie.

   Rien n'est réécrit : le texte enregistré reste celui qui a été tapé. */

export type SectionNote = { titre?: string; texte: string };
type Ligne = { puce: boolean; tete: string; reste: string };
type Bloc = { cle: string; titre: string; lignes: Ligne[] };

/* « MANDAT » → « Mandat » ; « SCI AVIENA » reste tel quel (un sigle suivi d'un nom). */
function titreLisible(t: string) {
  const x = t.trim().replace(/\s+/g, ' ');
  if (x.length > 3 && x === x.toUpperCase() && /[A-ZÀ-Ý]{4,}/.test(x) && !/\s/.test(x)) return x.charAt(0) + x.slice(1).toLowerCase();
  return x;
}

/* « Libellé : suite » — une espace avant les deux-points, comme on l'écrit
   en français : « 18:30 » ou « https:// » ne sont pas des libellés. */
const TETE = /^(.{2,48}?)\s:\s*(.*)$/;
const PUCE = /^[-–—•·*]\s+/;

function lire(ligne: string): Ligne {
  const puce = PUCE.test(ligne);
  const brut = puce ? ligne.replace(PUCE, '') : ligne;
  const m = brut.match(TETE);
  if (m && m[2] && m[1].length <= 42 && !/[.!?]$/.test(m[1])) return { puce, tete: m[1].trim(), reste: m[2].trim() };
  return { puce, tete: '', reste: brut };
}

export function decouper(sections: SectionNote[]): Bloc[] {
  const blocs: Bloc[] = [];
  sections.forEach((s, si) => {
    const paras = (s.texte || '').replace(/\r\n?/g, '\n').split(/\n[ \t]*\n+/).map(p => p.split('\n').map(l => l.trim()).filter(Boolean)).filter(p => p.length);
    paras.forEach((p, pi) => {
      let titre = '';
      let lignes = p;
      /* La première ligne peut nommer le paragraphe. */
      const premiere = p[0].match(TETE);
      const nomme = !!premiere && premiere[1].length <= 48 && !PUCE.test(p[0]);
      if (pi === 0 && s.titre) {
        titre = s.titre;
      } else if (nomme) {
        titre = titreLisible(premiere![1]);
        /* « Gestion locative SIVAL : le DPE… » → le texte commence par une majuscule. */
        const suite = premiere![2] ? premiere![2].charAt(0).toUpperCase() + premiere![2].slice(1) : '';
        lignes = suite ? [suite, ...p.slice(1)] : p.slice(1);
      }
      blocs.push({ cle: `${si}-${pi}`, titre, lignes: lignes.map(lire) });
    });
  });
  return blocs;
}

/* Les e-mails et les téléphones deviennent des liens. */
const LIENS = /([\w.+-]+@[\w-]+(?:\.[\w-]+)+)|((?:\+33\s?|0)[1-9](?:[\s.]?\d{2}){4})/g;
function avecLiens(t: string): ReactNode[] {
  const out: ReactNode[] = [];
  let i = 0;
  for (const m of t.matchAll(LIENS)) {
    const debut = m.index ?? 0;
    if (debut > i) out.push(t.slice(i, debut));
    const v = m[0];
    out.push(m[1]
      ? <a key={debut} className={n.lien} href={`mailto:${v}`}>{v}</a>
      : <a key={debut} className={n.lien} href={`tel:${v.replace(/[\s.]/g, '')}`}>{v}</a>);
    i = debut + v.length;
  }
  if (i < t.length) out.push(t.slice(i));
  return out;
}

function Lignes({ lignes }: { lignes: Ligne[] }) {
  /* Les lignes de liste qui se suivent vont dans la même liste. */
  const groupes: { puce: boolean; l: Ligne[] }[] = [];
  for (const l of lignes) {
    const dernier = groupes[groupes.length - 1];
    if (dernier && dernier.puce === l.puce && l.puce) dernier.l.push(l);
    else groupes.push({ puce: l.puce, l: [l] });
  }
  return (
    <>
      {groupes.map((g, gi) => g.puce ? (
        <ul key={gi} className={n.puces}>
          {g.l.map((l, i) => <li key={i}>{l.tete && <b>{`${l.tete} : `}</b>}{avecLiens(l.reste)}</li>)}
        </ul>
      ) : (
        <Fragment key={gi}>
          {g.l.map((l, i) => <p key={i} className={n.p}>{l.tete && <b>{`${l.tete} : `}</b>}{avecLiens(l.reste)}</p>)}
        </Fragment>
      ))}
    </>
  );
}

export default function NoteRiche({ sections, hauteur = 300, colonnes = true, avant }: {
  sections: SectionNote[];
  /* La hauteur au-delà de laquelle le texte se replie (en pixels). */
  hauteur?: number;
  /* Les blocs en colonnes quand la largeur le permet. */
  colonnes?: boolean;
  /* Ce qui se pose au-dessus des blocs (une alerte, une pastille). */
  avant?: ReactNode;
}) {
  const blocs = useMemo(() => decouper(sections), [sections]);
  const [ouvert, setOuvert] = useState(false);
  const [haut, setHaut] = useState(0);
  /* Mesurer ce que le texte fait déplié : au-delà de la hauteur repliée, il
     se replie ; et l'ouverture glisse jusqu'à sa vraie hauteur. L'observateur
     répond avant que l'écran ne se dessine : pas d'éclair du texte entier. */
  const mesure = useCallback((el: HTMLDivElement | null) => {
    if (!el || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(() => setHaut(el.offsetHeight));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const trop = haut > hauteur + 40;
  if (!blocs.length && !avant) return null;
  const replie = trop && !ouvert;
  return (
    <div className={n.note}>
      <div className={`${n.corps} ${replie ? n.replie : ''}`} style={{ maxHeight: replie ? hauteur : trop ? haut + 8 : undefined }}>
        <div ref={mesure} className={colonnes ? n.colonnes : n.pile}>
          {avant}
          {blocs.map(b => (
            <section key={b.cle} className={n.bloc}>
              {b.titre && <h4 className={n.titre}><i />{b.titre}</h4>}
              <Lignes lignes={b.lignes} />
            </section>
          ))}
        </div>
      </div>
      {trop && (
        <button type="button" className={n.deplier} aria-expanded={ouvert} onClick={() => setOuvert(o => !o)}>
          <Ic n={ouvert ? 'haut' : 'bas'} t={14} e={2.4} />
          {ouvert ? 'Replier' : 'Déplier, tout lire'}
        </button>
      )}
    </div>
  );
}
