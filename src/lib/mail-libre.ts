/* ═══ Le mail écrit à la main (« Nouveau mail », V3.41) ══════════════════
   Ce fichier sert à l'écran ET au serveur : l'aperçu montre exactement le
   mail qui partira, parce qu'ils sont fabriqués par les mêmes fonctions.
   Rien ici ne touche à la base.

   Deux habillages, au choix :
     · « simple »  — le mail tel qu'on l'écrit dans sa messagerie : le texte,
                     et c'est tout. Pour une personne, un notaire, un vendeur :
                     c'est ce qui arrive le mieux en boîte de réception.
     · « emilio »  — le bandeau marine au logo, le texte, et le pied avec le
                     nom et le téléphone du conseiller. Pour une annonce à
                     plusieurs acheteurs. Ni étiquette « Sélection privée », ni
                     lien « Je ne suis plus en recherche » : ce n'est pas une
                     sélection de biens.

   Le texte arrive de l'éditeur en HTML (gras, italique, souligné, listes,
   liens). `nettoyerHtml` ne garde que ces balises-là, sans aucun attribut
   sauf l'adresse d'un lien (http, https, mailto, tel) : un collage venu de
   Word ou d'une page web ne peut rien glisser d'autre dans le mail. */

import { IDENTITE_DEFAUT, type IdentiteAgence } from './agence';
import { conseillerDe, personnaliser, type PourMail } from './mail-variables';
import { LIEN_POLICE_MAIL } from '@/lib/mail-charte';

export type StyleMail = 'simple' | 'emilio';

export const STYLES_MAIL: { k: StyleMail; lib: string; aide: string }[] = [
  { k: 'simple', lib: 'Simple', aide: 'Comme un mail écrit dans ta messagerie. Le plus naturel, et celui qui arrive le mieux en boîte de réception.' },
  { k: 'emilio', lib: 'Avec l’en-tête Emilio', aide: 'Le bandeau au logo et ton nom en pied. Pour une annonce ou un message à plusieurs acheteurs.' },
];

const esc = (t: string) => String(t ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/* Les entités courantes, pour la version texte et les adresses de liens. */
function decoder(t: string): string {
  return t
    .replace(/&nbsp;/g, ' ')
    .replace(/&#(\d+);/g, (_, n: string) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n: string) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, '\'')
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
}

/* ── Le HTML de l'éditeur, gardé à ce qui a sa place dans un mail ── */
const GARDEES = new Set(['div', 'p', 'br', 'b', 'i', 'u', 'a', 'ul', 'ol', 'li', 'blockquote']);
const ALIAS: Record<string, string> = { strong: 'b', em: 'i' };
/* Les styles posés sur chaque balise : un mail n'a pas de feuille de style. */
const STYLE: Record<string, string> = {
  p: 'margin:0 0 12px',
  ul: 'margin:4px 0 12px;padding-left:22px',
  ol: 'margin:4px 0 12px;padding-left:22px',
  li: 'margin:0 0 4px',
  a: 'color:#22497D;text-decoration:underline',
  blockquote: 'margin:0 0 12px;padding-left:12px;border-left:3px solid #DCE3EC;color:#5B6B80',
};

/* L'adresse d'un lien : http(s), mailto ou tel ; « www.… » devient https. */
export function lienPropre(brut: string): string | null {
  let u = decoder(String(brut || '')).trim();
  if (!u || u.length > 2000) return null;
  if (/^www\./i.test(u)) u = `https://${u}`;
  if (/^[^\s@:/]+@[^\s@]+\.[^\s@]{2,}$/.test(u)) u = `mailto:${u}`;
  return /^(https?:\/\/[^\s]+|mailto:[^\s]+|tel:[+0-9 ().-]+)$/i.test(u) ? u : null;
}
function hrefDe(attrs: string): string | null {
  const m = attrs.match(/\bhref\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/i);
  return m ? lienPropre(m[1] ?? m[2] ?? m[3] ?? '') : null;
}
/* Un bout de texte entre deux balises : les entités restent, un « < » ou un
   « & » isolés sont échappés. */
const texteSur = (t: string) => t.replace(/&(?!(#\d+|#x[0-9a-f]+|[a-z][a-z0-9]*);)/gi, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

export function nettoyerHtml(brut: string): string {
  const h = String(brut || '').slice(0, 200_000)
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<(script|style|head|title|iframe|object|embed|svg|math|template|noscript|textarea|select)\b[\s\S]*?<\/\1\s*>/gi, '');
  const re = /<\/?([a-zA-Z][a-zA-Z0-9]*)\b([^>]*)>/g;
  const pile: string[] = [];
  let out = '';
  let i = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(h))) {
    out += texteSur(h.slice(i, m.index));
    i = re.lastIndex;
    const ferme = m[0].charAt(1) === '/';
    const brute = m[1].toLowerCase();
    const tag = ALIAS[brute] || brute;
    if (!GARDEES.has(tag)) continue;
    if (tag === 'br') { out += '<br>'; continue; }
    if (ferme) {
      const k = pile.lastIndexOf(tag);
      if (k < 0) continue;
      while (pile.length > k) out += `</${pile.pop()}>`;
      continue;
    }
    let attrs = '';
    if (tag === 'a') {
      const href = hrefDe(m[2]);
      if (!href) continue;
      attrs = ` href="${esc(href)}"`;
    }
    out += `<${tag}${attrs}${STYLE[tag] ? ` style="${STYLE[tag]}"` : ''}>`;
    if (!/\/\s*$/.test(m[2])) pile.push(tag);
  }
  out += texteSur(h.slice(i));
  while (pile.length) out += `</${pile.pop()}>`;
  return out;
}

/* Rien d'écrit : ni texte, ni lien. */
export const htmlVide = (html: string) => !htmlVersTexte(html).trim();

/* ── La version texte du mail (les messageries qui n'affichent pas le HTML,
      le Suivi du contact) ── */
export function htmlVersTexte(html: string): string {
  const t = String(html || '')
    .replace(/<(div|p)[^>]*>\s*<br\s*\/?>\s*<\/\1>/gi, '\n')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<p\b[^>]*>/gi, '\n\n')
    .replace(/<(div|blockquote|ul|ol)\b[^>]*>/gi, '\n')
    .replace(/<li\b[^>]*>/gi, '\n– ')
    .replace(/<a\b[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/gi, (_, href: string, dedans: string) => {
      const x = decoder(dedans.replace(/<[^>]+>/g, '')).trim();
      const u = decoder(href);
      const nu = u.replace(/^(mailto|tel):/i, '');
      return !x ? u : x === u || x === nu ? x : `${x} (${nu})`;
    })
    .replace(/<[^>]+>/g, '');
  return decoder(t).replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
}

/* Un texte brut (message pré-rédigé, signature des Paramètres) en lignes de
   l'éditeur : une ligne vide garde sa place. */
export function texteVersHtml(t: string): string {
  return String(t || '').replace(/\r\n?/g, '\n').split('\n').map(l => `<div>${l.trim() ? esc(l) : '<br>'}</div>`).join('');
}

/* {{prénom}}, {{nom}}… dans le HTML : les valeurs sont échappées. Sans
   prénom connu (une adresse hors CRM), « Bonjour {{prénom}}, » devient
   « Bonjour, ». */
export function personnaliserHtml(html: string, c: PourMail, conseiller: string): string {
  return personnaliser(html, { prenom: esc(c.prenom || ''), nom: esc(c.nom || ''), reference: esc(c.reference || '') }, esc(conseiller))
    .replace(/(?:[ \t]|&nbsp;)+,/g, ',');
}
export function personnaliserTexte(t: string, c: PourMail, conseiller: string): string {
  return personnaliser(t, c, conseiller).replace(/[ \t\u00a0]+,/g, ',');
}
/* L'objet : « Votre projet, {{prénom}} » sans prénom ne finit pas sur une virgule. */
export function personnaliserObjet(t: string, c: PourMail, conseiller: string): string {
  return personnaliserTexte(t, c, conseiller).replace(/[\s,;:–—-]+$/, '').trim();
}

/* ── L'habillage : ce que le pied et le bandeau disent ── */
export type Habillage = { conseiller: string; telephone: string; agence: string; mentions: string; logo: string };

/* « Alexandre ROGELET » → « Alexandre Rogelet » pour le pied. */
const joliNom = (n: string) => n.split(' ').map(m => (m.length > 1 && m === m.toUpperCase()
  ? m.charAt(0) + m.slice(1).toLowerCase().replace(/([-'’])([a-zà-ÿ])/g, (_, s: string, l: string) => s + l.toUpperCase())
  : m)).join(' ');

export function habillageDe(reglages: Record<string, string | undefined>, identite: IdentiteAgence | null, site: string): Habillage {
  const id = identite || IDENTITE_DEFAUT;
  const adresse = [id.adresse, [id.cp, id.ville].filter(Boolean).join(' ')].filter(Boolean).join(', ');
  return {
    conseiller: joliNom(conseillerDe(reglages)),
    telephone: (reglages.conseiller_telephone || '').trim() || '06 58 95 76 32',
    agence: id.nom || 'Emilio Immobilier',
    mentions: [`${id.nom} — ${id.societe}${id.forme ? `, ${id.forme}` : ''}`, adresse, id.carte ? `carte professionnelle ${id.carte}` : ''].filter(Boolean).join(' · '),
    logo: `${site.replace(/\/+$/, '')}/logo_high_resolution_white.png`,
  };
}

/* ── Les documents trop lourds pour partir en pièces jointes ── */
export type LienPiece = { nom: string; url: string; taille: number };
const tailleFr = (o: number) => (o >= 1_000_000 ? `${String(Math.round(o / 100_000) / 10).replace('.', ',')} Mo` : `${Math.max(1, Math.round(o / 1000))} ko`);
function blocLiens(liens: LienPiece[], jours: number): string {
  if (!liens.length) return '';
  return `<div style="margin:18px 0 6px;padding:14px 16px;border:1px solid #E8EDF3;border-radius:12px;background:#F5F8FC">
  <div style="font-size:12px;font-weight:700;letter-spacing:.6px;color:#A95808;margin-bottom:8px">DOCUMENTS À TÉLÉCHARGER · LIENS VALABLES ${jours} JOURS</div>
  ${liens.map(l => `<div style="margin:6px 0"><a href="${esc(l.url)}" style="color:#13243D;font-weight:700">${esc(l.nom)}</a> <span style="color:#8FA3BF;font-size:12px">· ${tailleFr(l.taille)}</span></div>`).join('')}
</div>`;
}
export const texteLiens = (liens: LienPiece[], jours: number) => (liens.length
  ? `\n\nDocuments à télécharger (liens valables ${jours} jours) :\n${liens.map(l => `- ${l.nom} : ${l.url}`).join('\n')}`
  : '');

/* ── Le mail entier ── */
export function mailLibreHtml(o: { style: StyleMail; corps: string; h: Habillage; liens?: LienPiece[]; jours?: number }): string {
  const corps = `${o.corps}${blocLiens(o.liens || [], o.jours || 7)}`;
  const tete = `<!DOCTYPE html><html lang="fr"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title></title>${LIEN_POLICE_MAIL}</head>`;
  if (o.style === 'simple') {
    return `${tete}<body style="margin:0;padding:0;background:#ffffff;">
<div style="font-family:'Plus Jakarta Sans',-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:14.5px;line-height:1.6;color:#13243D;max-width:640px;padding:6px 4px;">${corps}</div>
</body></html>`;
  }
  const h = o.h;
  return `${tete}<body style="margin:0;padding:0;background:#E6EDF6;font-family:'Plus Jakarta Sans',-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#E6EDF6;">
  <tr><td align="center" style="padding:24px 10px;">
    <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;width:100%;background:#ffffff;border:1px solid #DCE3EC;border-radius:16px;overflow:hidden;">
      <tr><td style="background:#22497D;border-bottom:3px solid #E68B23;padding:18px 26px;">
        <img src="${esc(h.logo)}" alt="${esc(h.agence)}" height="30" style="height:30px;width:auto;display:block;border:0;color:#ffffff;font-weight:700;font-size:16px;" />
      </td></tr>
      <tr><td style="padding:26px 26px 22px;">
        <div style="font-size:14.5px;line-height:1.7;color:#46566B;">${corps}</div>
      </td></tr>
      <tr><td style="background:#22497D;padding:16px 26px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
          <td style="font-size:14px;font-weight:700;color:#ffffff;">${esc(h.conseiller)}<div style="font-size:11px;font-weight:400;color:rgba(255,255,255,.6);margin-top:3px;">${esc(h.agence)} · Paris &amp; Hauts-de-Seine</div></td>
          <td align="right" style="font-size:15px;font-weight:700;color:#F2B266;white-space:nowrap;"><a href="tel:${esc(h.telephone.replace(/[^+0-9]/g, ''))}" style="color:#F2B266;text-decoration:none;">${esc(h.telephone)}</a></td>
        </tr></table>
      </td></tr>
    </table>
    <div style="max-width:600px;margin:12px auto 0;font-size:11px;line-height:1.6;color:#8FA3BF;text-align:center;">${esc(h.mentions)}</div>
  </td></tr>
</table>
</body></html>`;
}
