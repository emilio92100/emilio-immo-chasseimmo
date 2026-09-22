/**
 * L'envoi des notifications à l'espace acheteur.
 *
 * Comment ça marche, en trois phrases :
 *   1. Le téléphone du client donne une « adresse de poussée » — une URL
 *      longue chez Apple, Google ou Mozilla, propre à cet appareil.
 *   2. On envoie un signal à cette adresse, signé avec notre paire de clés
 *      (VAPID) : c'est la signature qui prouve que ça vient bien de nous.
 *   3. Le téléphone réveille src/app/sw.js, qui va chercher le texte de la
 *      notification et l'affiche.
 *
 * Le signal ne transporte AUCUN texte, volontairement. Mettre le texte dedans
 * obligerait à le chiffrer nous-mêmes (une bonne centaine de lignes de
 * cryptographie délicate). Le service worker fait un aller-retour de plus,
 * et en échange le texte est toujours à jour au moment où il s'affiche :
 * si le client a ouvert ses biens entre-temps, la notification le sait.
 *
 * Les deux clés vivent dans les variables d'environnement Vercel :
 *   NEXT_PUBLIC_VAPID_PUBLIC_KEY   la publique (le navigateur la voit)
 *   VAPID_PRIVATE_KEY              la privée (jamais côté client)
 *   VAPID_SUBJECT                  mailto:arogelet@emilio-immo.com
 */

const PUBLIQUE = () => process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || '';
const PRIVEE = () => process.env.VAPID_PRIVATE_KEY || '';
const SUJET = () => process.env.VAPID_SUBJECT || 'mailto:arogelet@emilio-immo.com';

export function pushConfigure(): boolean {
  return !!PUBLIQUE() && !!PRIVEE();
}

/* ── base64 « url », celui des jetons web : pas de +, pas de /, pas de = ── */

function versB64url(octets: Uint8Array): string {
  let s = '';
  for (const o of octets) s += String.fromCharCode(o);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function depuisB64url(texte: string): Uint8Array {
  const p = texte.replace(/-/g, '+').replace(/_/g, '/');
  const brut = atob(p + '='.repeat((4 - (p.length % 4)) % 4));
  const out = new Uint8Array(brut.length);
  for (let i = 0; i < brut.length; i++) out[i] = brut.charCodeAt(i);
  return out;
}

/* ── la clé de signature ──
   La clé publique est un point de courbe de 65 octets : un 0x04 d'en-tête,
   puis x sur 32 octets, puis y sur 32. La privée est le scalaire, 32 octets.
   Web Crypto veut tout ça sous forme de JWK — on le reconstitue ici. */
let clePromesse: Promise<CryptoKey> | null = null;

function cleDeSignature(): Promise<CryptoKey> {
  if (clePromesse) return clePromesse;
  clePromesse = (async () => {
    const pub = depuisB64url(PUBLIQUE());
    const priv = depuisB64url(PRIVEE());
    if (pub.length !== 65 || pub[0] !== 0x04) {
      throw new Error('Clé publique VAPID invalide (65 octets attendus)');
    }
    return crypto.subtle.importKey(
      'jwk',
      {
        kty: 'EC', crv: 'P-256', ext: true,
        x: versB64url(pub.slice(1, 33)),
        y: versB64url(pub.slice(33, 65)),
        d: versB64url(priv),
      },
      { name: 'ECDSA', namedCurve: 'P-256' },
      false,
      ['sign'],
    );
  })();
  return clePromesse;
}

/* ── le laissez-passer ──
   Un jeton par service de poussée (Apple, Google…), valable douze heures.
   On le garde en mémoire : le resigner à chaque envoi serait du gâchis
   quand on prévient dix appareils d'affilée. */
const jetons = new Map<string, { valeur: string; fin: number }>();

async function laissezPasser(destinataire: string): Promise<string> {
  const garde = jetons.get(destinataire);
  const maintenant = Math.floor(Date.now() / 1000);
  if (garde && garde.fin - 600 > maintenant) return garde.valeur;

  const fin = maintenant + 12 * 3600;
  const entete = versB64url(new TextEncoder().encode(JSON.stringify({ typ: 'JWT', alg: 'ES256' })));
  const corps = versB64url(new TextEncoder().encode(JSON.stringify({
    aud: destinataire, exp: fin, sub: SUJET(),
  })));
  const aSigner = `${entete}.${corps}`;

  const signature = await crypto.subtle.sign(
    { name: 'ECDSA', hash: 'SHA-256' },
    await cleDeSignature(),
    new TextEncoder().encode(aSigner),
  );

  const valeur = `${aSigner}.${versB64url(new Uint8Array(signature))}`;
  jetons.set(destinataire, { valeur, fin });
  return valeur;
}

export type Resultat = 'ok' | 'perime' | 'erreur';

/**
 * Réveille un appareil. Ne transporte pas de texte : voir l'en-tête du fichier.
 *   'ok'     → le service a pris le message en charge
 *   'perime' → l'appareil n'existe plus (désinstallé, navigateur réinitialisé)
 *              → l'appelant doit effacer la ligne
 *   'erreur' → problème passager, on réessaiera la prochaine fois
 */
export async function reveiller(endpoint: string): Promise<Resultat> {
  if (!pushConfigure()) return 'erreur';
  try {
    const destinataire = new URL(endpoint).origin;
    const reponse = await fetch(endpoint, {
      method: 'POST',
      headers: {
        /* Une journée : si le téléphone est éteint ce soir, il recevra la
           notification demain matin en se rallumant. Au-delà, le bien n'est
           plus une nouvelle. */
        TTL: '86400',
        Urgency: 'normal',
        Authorization: `vapid t=${await laissezPasser(destinataire)}, k=${PUBLIQUE()}`,
      },
    });
    if (reponse.status === 404 || reponse.status === 410) return 'perime';
    return reponse.ok ? 'ok' : 'erreur';
  } catch {
    return 'erreur';
  }
}
