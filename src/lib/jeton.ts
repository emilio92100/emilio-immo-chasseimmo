/**
 * Le lien de l'espace acheteur.
 *
 * Ce lien EST le mot de passe : il n'y a ni compte ni code. Tout tient donc
 * dans un équilibre — assez court pour qu'un client le reçoive par SMS sans
 * le prendre pour du spam, assez imprévisible pour que personne ne tombe
 * dessus par hasard.
 *
 *   espace.emilio-immo.com/dupont-k3n8vq2fab
 *
 * Le nom devant n'a **aucun rôle de sécurité** : il rassure à la lecture, et
 * il aide Alexandre à reconnaître un lien dans son historique. Tout le
 * travail est fait par les dix caractères tirés au hasard — mille milliards
 * de milliards de combinaisons, là où un « dupont-800000 » se devinerait.
 *
 * ⚠️ Les anciens jetons de 64 caractères restent valables et gardent leur
 * ancienne adresse : un lien déjà envoyé à un client ne casse jamais.
 */

/* Ni l, ni i, ni o, ni 0, ni 1 : un client qui recopie son lien à la main ne
   doit pas avoir à deviner lequel des deux caractères c'était. */
const ALPHABET = 'abcdefghjkmnpqrstuvwxyz23456789';
const LONGUEUR = 10;

/** La partie imprévisible, seule garante de la confidentialité du lien. */
export function partieAleatoire(n: number = LONGUEUR): string {
  const octets = new Uint8Array(n);
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
    crypto.getRandomValues(octets);
  } else {
    /* Repli théorique : Math.random n'est pas cryptographique, mais mieux vaut
       un jeton faible qu'une recherche créée sans lien du tout. */
    for (let i = 0; i < n; i++) octets[i] = Math.floor(Math.random() * 256);
  }
  let s = '';
  for (let i = 0; i < n; i++) s += ALPHABET[octets[i] % ALPHABET.length];
  return s;
}

/** Le nom de famille, nettoyé : accents, espaces et ponctuation en moins. */
export function poignee(prenom?: string | null, nom?: string | null): string {
  const brut = String(nom || '').trim() || String(prenom || '').trim();
  return brut
    .normalize('NFD').replace(/[̀-ͯ]/g, '')   // é → e
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 14);
}

/** Le jeton complet, à ranger dans `recherches.token_espace`. */
export function jetonEspace(prenom?: string | null, nom?: string | null): string {
  const p = poignee(prenom, nom);
  return p ? `${p}-${partieAleatoire()}` : partieAleatoire(14);
}

/* Le sous-domaine dédié à l'espace acheteur. Le CRM, lui, vit sur
   crm.emilio-immo.com : les deux pointent sur le même projet, c'est le nom
   d'hôte qui décide de ce qu'on affiche (voir src/proxy.ts). */
export const HOTE_ESPACE = 'espace.emilio-immo.com';

/* Au-delà de cette longueur, on a affaire à un ancien jeton de 64 caractères :
   il garde l'adresse sous laquelle il a été envoyé au client. */
const LONGUEUR_ANCIEN = 40;

/**
 * L'adresse à donner au client.
 *   jeton court  → https://espace.emilio-immo.com/dupont-k3n8vq2fab
 *   ancien jeton → https://<le site>/espace/<les 64 caractères>
 */
/**
 * L'adresse publique d'un bien — celle qu'on envoie à quelqu'un qui n'a pas
 * d'espace : un conjoint, un proche, un confrère.
 *
 * Elle porte le domaine d'Emilio, pas celui de Vercel. Un lien en
 * « …vercel.app » dans un mail fait bricolage, et il change si l'hébergement
 * change un jour. Le domaine, lui, est à Alexandre.
 *
 * ⚠️ Le portail doit laisser passer /bien/ sur ce domaine (voir src/proxy.ts),
 * sinon l'adresse est réécrite vers l'espace et ne mène nulle part.
 */
export function lienBienPublic(id: string): string {
  return `https://${HOTE_ESPACE}/bien/${id}`;
}

export function lienEspace(token?: string | null, origine?: string): string {
  if (!token) return '';
  if (token.length <= LONGUEUR_ANCIEN) return `https://${HOTE_ESPACE}/${token}`;
  const base = origine || (typeof window !== 'undefined' ? window.location.origin : '');
  return `${base}/espace/${token}`;
}
