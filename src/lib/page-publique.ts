import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';
import { AGENTS_NAVIGATEUR, ENTETES_NAVIGATEUR } from '@/lib/extraction-annonce';

/* ═══ Télécharger une page dont l'adresse vient d'un inconnu (V3.197) ═══════
   Le lien pour les agences est public : n'importe qui ayant le lien peut
   coller une adresse, et le serveur va la chercher. Sans garde-fou, on
   pourrait lui faire ouvrir une adresse interne (le réseau de l'hébergeur,
   une machine locale). Ici :
     - seulement http(s), sur les ports 80 et 443, sans identifiant ;
     - le nom est résolu, et TOUTES ses adresses doivent être publiques ;
     - les redirections sont suivies une à une (4 au plus), chacune revérifiée ;
     - 15 secondes et 4 Mo au plus.
   Rend le HTML, ou '' (refusé, injoignable, trop gros, pas une page). */

const MAX_OCTETS = 4 * 1024 * 1024;
const MAX_REDIRECTIONS = 4;

/* Une adresse IP privée, locale, réservée : jamais. */
function ipInterdite(ip: string): boolean {
  const v = isIP(ip);
  if (v === 4) {
    const [a, b] = ip.split('.').map(Number);
    return a === 0 || a === 10 || a === 127 || a >= 224
      || (a === 100 && b >= 64 && b <= 127)        // 100.64/10
      || (a === 169 && b === 254)                   // lien local, métadonnées
      || (a === 172 && b >= 16 && b <= 31)
      || (a === 192 && b === 168)
      || (a === 192 && b === 0)                     // 192.0.0/24, 192.0.2/24
      || (a === 198 && (b === 18 || b === 19))      // bancs d'essai
      || (a === 198 && b === 51) || (a === 203 && b === 0);
  }
  if (v === 6) {
    const x = ip.toLowerCase();
    if (x === '::' || x === '::1') return true;
    const mappe = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/.exec(x);
    if (mappe) return ipInterdite(mappe[1]);
    return /^(fc|fd)/.test(x) || /^fe[89ab]/.test(x) || /^ff/.test(x) || x.startsWith('2001:db8') || x.startsWith('64:ff9b');
  }
  return true;
}

/* L'adresse est-elle sûre à ouvrir ? Le nom résolu, chacune de ses adresses vérifiée. */
async function adresseSure(brut: string): Promise<URL | null> {
  let u: URL;
  try { u = new URL(brut); } catch { return null; }
  if (u.protocol !== 'https:' && u.protocol !== 'http:') return null;
  if (u.username || u.password) return null;
  if (u.port && u.port !== '80' && u.port !== '443') return null;
  const hote = u.hostname.replace(/^\[|\]$/g, '').toLowerCase();
  if (!hote || hote === 'localhost' || /\.(local|localhost|internal|lan|home|corp)$/.test(hote)) return null;
  if (isIP(hote)) return ipInterdite(hote) ? null : u;
  if (!hote.includes('.')) return null;
  try {
    const adresses = await lookup(hote, { all: true, verbatim: true });
    if (!adresses.length || adresses.some(a => ipInterdite(a.address))) return null;
  } catch { return null; }
  return u;
}

async function lireCorps(res: Response): Promise<string> {
  const longueur = Number(res.headers.get('content-length') || 0);
  if (longueur > MAX_OCTETS) return '';
  if (!res.body) return '';
  const lecteur = res.body.getReader();
  const morceaux: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await lecteur.read();
    if (done) break;
    total += value.byteLength;
    if (total > MAX_OCTETS) { await lecteur.cancel().catch(() => {}); return ''; }
    morceaux.push(value);
  }
  return new TextDecoder('utf-8').decode(Buffer.concat(morceaux.map(m => Buffer.from(m))));
}

/** La page d'une annonce, téléchargée sans jamais sortir sur une adresse interne. */
export async function pagePublique(url: string): Promise<string> {
  for (const agent of AGENTS_NAVIGATEUR) {
    try {
      const fin = Date.now() + 15_000;
      let cible = url;
      for (let saut = 0; saut <= MAX_REDIRECTIONS; saut++) {
        const sure = await adresseSure(cible);
        if (!sure) return '';
        const reste = fin - Date.now();
        if (reste <= 0) break;
        const res = await fetch(sure.toString(), { headers: ENTETES_NAVIGATEUR(agent), redirect: 'manual', signal: AbortSignal.timeout(reste) });
        if (res.status >= 300 && res.status < 400) {
          const vers = res.headers.get('location');
          if (!vers) break;
          cible = new URL(vers, sure).toString();
          continue;
        }
        if (!res.ok) break;
        if (!/html|xml|text/i.test(res.headers.get('content-type') || 'text/html')) return '';
        const html = await lireCorps(res);
        if (html.length > 3000 && !html.includes('cf-browser-verification')) return html;
        break;
      }
    } catch { continue; }
  }
  return '';
}
