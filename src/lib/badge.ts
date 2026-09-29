/* ═══ Le badge du CRM ════════════════════════════════════════════════════
   Le cookie `emilio_acces` que /api/login pose après avoir vérifié la
   session Supabase, et que src/proxy.ts demande à chaque page du CRM.

   V3.33. Il valait l'empreinte SHA-256 de `EMILIO_ACCESS_CODE` : la même
   valeur pour toujours, et calculable par quiconque devinait ce code (c'était
   l'ancien code d'accès, tapé à la main). Or plusieurs routes du CRM lisent
   la base avec la clé de service sur la seule foi de ce cookie.

   Désormais c'est un badge signé et daté : « v1.<fin>.<signature> ». La
   signature (HMAC-SHA256) mêle le code et la clé de service de Supabase,
   que personne ne peut deviner ; la date de fin (30 jours) fait qu'un badge
   copié finit par ne plus rien ouvrir. Changer `EMILIO_ACCESS_CODE` sur
   Vercel reste le moyen d'invalider d'un coup tous les badges en circulation.

   Web Crypto seulement : ce fichier sert aussi au portail (proxy.ts). */

export const COOKIE_BADGE = 'emilio_acces';
export const DUREE_BADGE = 60 * 60 * 24 * 30; // 30 jours, en secondes

const enc = new TextEncoder();
const hex = (b: ArrayBuffer) => Array.from(new Uint8Array(b)).map(x => x.toString(16).padStart(2, '0')).join('');

async function cle(): Promise<CryptoKey | null> {
  const code = process.env.EMILIO_ACCESS_CODE;
  if (!code) return null;
  const secret = `${code}|${process.env.SUPABASE_SERVICE_ROLE_KEY || ''}`;
  return crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
}

async function signer(k: CryptoKey, fin: string): Promise<string> {
  return hex(await crypto.subtle.sign('HMAC', k, enc.encode(`v1.${fin}`)));
}

/** Un badge neuf, valable 30 jours. `null` si le serveur n'est pas configuré. */
export async function fabriquerBadge(): Promise<string | null> {
  const k = await cle();
  if (!k) return null;
  const fin = String(Math.floor(Date.now() / 1000) + DUREE_BADGE);
  return `v1.${fin}.${await signer(k, fin)}`;
}

/** Vrai si le badge est authentique et pas encore expiré. */
export async function badgeValide(valeur: string | undefined | null): Promise<boolean> {
  const m = /^v1\.(\d{9,11})\.([0-9a-f]{64})$/.exec(valeur || '');
  if (!m) return false;
  if (Number(m[1]) * 1000 < Date.now()) return false;
  const k = await cle();
  if (!k) return false;
  const attendu = await signer(k, m[1]);
  /* Comparaison à temps constant. */
  let diff = 0;
  for (let i = 0; i < attendu.length; i++) diff |= attendu.charCodeAt(i) ^ m[2].charCodeAt(i);
  return diff === 0;
}
