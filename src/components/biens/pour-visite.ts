import { ETAPES_BIEN, type Donnees } from '@/lib/biens-vente';
import { liste, txt } from '@/lib/actes';
import type { LigneVisite, PourVisite } from './VueBien';

/* Les indications de visite d'un bien de l'agence (V3.31, rangées par usage
   en V3.81 : l'occupation, les codes, la personne sur place, le reste, puis
   le chemin et les consignes).

   V3.134 : sorties de FicheBien pour servir aussi à l'agenda (Alexandre :
   « que ça reprenne les indications de visite […] comme ça, ça évite de
   cliquer sur le bien »). La fiche du bien et le détail d'une visite dans
   l'agenda lisent la même chose. */

/* Les mots des listes de choix, lus dans le formulaire. */
const OPTIONS: Record<string, Record<string, string>> = {};
for (const e of ETAPES_BIEN) for (const c of e.champs) if (c.t === 'choix' || c.t === 'cases') OPTIONS[c.cle] = Object.fromEntries(c.options.map(o => [o.v, o.l]));
const lib = (d: Donnees, cle: string) => { const v = d[cle]; return typeof v === 'string' && v ? OPTIONS[cle]?.[v] || v : ''; };
const libs = (d: Donnees, cle: string) => liste(d, cle).map(v => OPTIONS[cle]?.[v] || v);

export function visitePourCarte(d: Donnees): PourVisite {
  const cles = [lib(d, 'cles'), d.cles === 'agence' && txt(d, 'trousseau') ? `trousseau ${txt(d, 'trousseau')}` : ''].filter(Boolean).join(', ');
  const occ = typeof d.occupation === 'string' && d.occupation ? { v: d.occupation, l: lib(d, 'occupation') } : null;
  const codes = [
    { ic: 'clavier', l: 'Digicode', v: txt(d, 'digicode') },
    { ic: 'interphone', l: 'Interphone', v: txt(d, 'interphone') },
    { ic: 'porte', l: 'Porte', v: txt(d, 'porte') },
    { ic: 'cave', l: 'Cave · box', v: txt(d, 'annexesNum') },
  ].filter(x => x.v);
  const nom = txt(d, 'contactNom'), tel = txt(d, 'contactTel');
  const infos: LigneVisite[] = [
    { ic: 'cle', l: 'Les clés', v: cles },
    { ic: 'horloge', l: 'Heures de visite', v: txt(d, 'creneaux') },
    { ic: 'immeuble', l: 'En bas', v: libs(d, 'accesBas').join(', ').toLowerCase().replace(/^./, x => x.toUpperCase()) },
    { ic: 'ascenseur', l: 'En sortant de l’ascenseur', v: d.accesAscenseur === 'aucun' ? '' : lib(d, 'accesAscenseur') },
  ].filter(x => x.v);
  const encarts = [{ ic: 'carte', l: 'Le chemin', v: txt(d, 'itineraire') }, { ic: 'info', l: 'Consignes', v: txt(d, 'consignes') }].filter(x => x.v);
  return { occupation: occ && occ.l ? occ : null, dispo: txt(d, 'disponible'), codes, contact: nom || tel ? { nom, tel } : null, infos, encarts };
}

/* Rien de noté pour la visite : la carte n'a rien à montrer. */
export const pourVisiteVide = (p: PourVisite) =>
  !p.occupation && !p.dispo && !p.codes.length && !p.contact && !p.infos.length && !p.encarts.length;
