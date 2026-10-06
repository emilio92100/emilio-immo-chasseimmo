/* ═══ Reformuler l'annonce avec l'IA (V3.79) ═════════════════════════════════
   Le bouton « Reformuler l'annonce » de la fiche et de l'éditeur. Les faits
   de la fiche partent à /api/biens-vente/annonce, qui rend un titre et une
   présentation ; les mentions obligatoires sont ajoutées ici, depuis la fiche
   (mentionsAnnonce), jamais par l'IA. Chaque appel demande une nouvelle
   version. */

import { faitsAnnonce, mentionsAnnonce, type Donnees } from '@/lib/biens-vente';

let version = 0;

/* Le texte actuel, sans les mentions qu'on y avait ajoutées : l'IA n'a pas
   à les relire (elle ne doit pas les réécrire). */
const LIGNES_MENTIONS = /^(Prix\s*:|DPE\s*:|DPE vierge|Copropriété de|Montant estimé des dépenses|Les informations sur les risques)/;
export function sansMentions(texte: string, d: Donnees): string {
  const m = mentionsAnnonce(d);
  const t = m && texte.includes(m) ? texte.replace(m, '') : texte;
  return t.split('\n').filter(l => !LIGNES_MENTIONS.test(l.trim())).join('\n').replace(/\n{3,}/g, '\n\n').trim();
}

/* `brouillon` (V3.80) : le texte en cours dans la fenêtre « Modifier
   l'annonce », pas encore enregistré dans la fiche. */
export async function reformulerAnnonce(d: Donnees, brouillon?: { titre: string; texte: string }): Promise<{ titre: string; texte: string }> {
  version += 1;
  const actuel = brouillon ? brouillon.texte : typeof d.annonceTexte === 'string' ? d.annonceTexte : '';
  const titre = brouillon ? brouillon.titre : typeof d.annonceTitre === 'string' ? d.annonceTitre : '';
  const r = await fetch('/api/biens-vente/annonce', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ faits: faitsAnnonce(d), texte: sansMentions(actuel, d), titre, version }),
  });
  const j = await r.json().catch(() => ({ ok: false, erreur: `Erreur ${r.status}` })) as { ok?: boolean; erreur?: string; titre?: string; texte?: string };
  if (!j.ok || !j.texte) throw new Error(j.erreur || 'L’annonce n’a pas pu être écrite.');
  return { titre: j.titre || titre, texte: `${j.texte.trim()}\n\n${mentionsAnnonce(d)}` };
}
