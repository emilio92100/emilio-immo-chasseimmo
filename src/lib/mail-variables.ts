/* ═══ Les mots qui se remplacent dans un mail ═══════════════════════════════
   Un mail écrit une fois pour plusieurs clients porte des variables :
   {{prénom}}, {{nom}}, {{reference}}, {{conseiller}}. /api/send-mail les
   remplace pour chaque destinataire, juste avant l'envoi.

   Jusqu'à la V3.20, seul `{{prénom}}` — avec l'accent — était remplacé : la
   page Paramètres annonçait `{{prenom}}`, `{{nom}}`, `{{reference}}` et
   `{{conseiller}}`, et un mail bâti sur ces modèles partait avec les
   accolades écrites en toutes lettres. Désormais l'accent, la casse et les
   espaces ne comptent plus : `{{ Prénom }}` et `{{prenom}}` se valent.

   Et la signature des mails se lit dans les Paramètres (`signature_email`),
   au lieu d'être recopiée en dur dans chaque écran. Rien ici ne touche à la
   base : ce fichier sert au navigateur comme au serveur. */

export type PourMail = { prenom?: string | null; nom?: string | null; reference?: string | null };

/** Les réglages des Paramètres qui servent aux mails. */
export const CLES_MAIL = ['signature_email', 'conseiller_prenom', 'conseiller_nom', 'agence_nom', 'conseiller_telephone', 'template_email_objet', 'template_email_corps'];

const sansAccent = (t: string) => t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();

/** Le nom du conseiller, tel que {{conseiller}} l'écrit. */
export function conseillerDe(p: Record<string, string | undefined>): string {
  const nom = `${(p.conseiller_prenom || '').trim()} ${(p.conseiller_nom || '').trim()}`.trim();
  return nom || 'Alexandre ROGELET';
}

/** La signature des mails : celle des Paramètres, sinon celle que la page
    Paramètres affiche d'office (le même calcul, pour que les deux ne se
    contredisent jamais). */
export function signatureDe(p: Record<string, string | undefined>): string {
  const posee = texteModele(p.signature_email || '').trim();
  if (posee) return posee;
  return `Cordialement,\n${p.conseiller_prenom || 'Alexandre'} ${p.conseiller_nom || 'ROGELET'}\n${p.agence_nom || 'Emilio Immobilier'}\n${p.conseiller_telephone || '06 58 95 76 32'}`;
}

/** Remplace les variables connues ; une variable inconnue reste telle quelle,
    pour qu'une faute de frappe se voie à la relecture plutôt que de
    disparaître. */
export function personnaliser(texte: string, c: PourMail, conseiller: string): string {
  return (texte || '').replace(/\{\{\s*([^{}]{1,30}?)\s*\}\}/g, (tout, brut: string) => {
    switch (sansAccent(brut)) {
      case 'prenom': return (c.prenom || '').trim();
      case 'nom': return (c.nom || '').trim();
      case 'reference': return (c.reference || '').trim();
      case 'conseiller': return conseiller;
      default: return tout;
    }
  });
}

/** V3.151 (Alexandre : « il y a des slash n à côté de Suite… ») : un modèle
    enregistré avec des « \n » écrits en toutes lettres (collé depuis un
    autre outil, ou posé en SQL) retrouve ses vrais retours à la ligne. */
export const texteModele = (t: string) => String(t || '').replace(/\\r\\n|\\n|\\r/g, '\n');

/** V3.151 (« Cordialement, Alexandre Rogelet est écrit en deux ») : le texte
    porte-t-il déjà sa signature ? Mot pour mot (espaces et retours à la ligne
    mis à part), ou une formule de fin suivie du nom du conseiller. */
export function dejaSigne(texte: string, sig: string, conseiller: string): boolean {
  const n = (t: string) => sansAccent(t).replace(/\s+/g, ' ').trim();
  const t = n(texte);
  if (n(sig) && t.includes(n(sig))) return true;
  const fin = t.slice(-260);
  return /(cordialement|bien a vous|a bientot|bonne journee|belle journee|sinceres salutations)/.test(fin) && fin.includes(n(conseiller).split(' ')[0] || '§');
}

/** Les variables, dans l'ordre où on les présente. */
export const VARIABLES_MAIL = ['{{prénom}}', '{{nom}}', '{{reference}}', '{{conseiller}}'];
