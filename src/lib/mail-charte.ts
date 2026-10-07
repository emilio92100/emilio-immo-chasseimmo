/* La charte des mails (V3.118) : les couleurs et la police du site
   emilio-immo.com, et le logo Emilio en tête de chaque mail. Alexandre :
   « il faut vraiment que les mails soient jolis, toujours avec le logo ».

   Les grands mails (envoi de biens, bienvenue, point automatique) ont leur
   propre mise en page, en tableaux (send-mail, point-auto) : ils reprennent
   ces couleurs. Les mails courts (codes de signature, mandat, alertes
   internes, partage d'un bien…) passent par `enveloppeMail` : la bande bleue
   au logo, un filet orange, le titre, puis le texte. */

export const MAIL = {
  marque: '#22497D', marqueFonce: '#1B3D6B', encre: '#13243D',
  texte: '#46566B', plume: '#5B6B80', plumeClair: '#8FA3BF',
  or: '#E68B23', orTexte: '#A95808', orClair: '#F2B266', orFond: '#FFF6EC', orTrait: '#F7D5B0',
  fond: '#F5F8FC', fondPage: '#E6EDF6', trait: '#E8EDF3', traitFort: '#DCE3EC',
};

/* Plus Jakarta Sans, la police du site, là où la messagerie sait la charger
   (Apple Mail, iPhone) ; sinon les polices du système, très proches. */
export const POLICE_MAIL = "'Plus Jakarta Sans',-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";
export const LIEN_POLICE_MAIL = '<link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;600;700;800&amp;display=swap" rel="stylesheet" />';

/* Le logo blanc, posé sur la bande bleue. Servi par le CRM lui-même (le
   proxy laisse passer les images : src/proxy.ts). */
const SITE = (process.env.NEXT_PUBLIC_SITE_URL || 'https://emilio-immo-chasseimmo.vercel.app').replace(/\/+$/, '');
export const LOGO_BLANC_MAIL = `${SITE}/logo_high_resolution_white.png`;

/* Le logo en <img>, prêt à poser dans une bande bleue. `mention` : un petit
   mot à droite (« CRM » pour les alertes envoyées à Alexandre). */
export function logoMail(mention = '', hauteur = 28): string {
  const img = `<img src="${LOGO_BLANC_MAIL}" alt="Emilio Immobilier" height="${hauteur}" style="height:${hauteur}px;width:auto;display:inline-block;vertical-align:middle;border:0;color:#ffffff;font-weight:800;font-size:15px;" />`;
  return mention
    ? `${img}<span style="display:inline-block;vertical-align:middle;margin-left:10px;padding:3px 8px;border-radius:99px;background:rgba(255,255,255,.14);color:${MAIL.orClair};font-size:10px;font-weight:800;letter-spacing:1.5px;">${mention}</span>`
    : img;
}

/* L'enveloppe des mails courts. `titre` est déjà échappé par l'appelant. */
export function enveloppeMail(o: { titre?: string; corps: string; pied?: string; mention?: string }): string {
  return `<div style="font-family:${POLICE_MAIL};max-width:560px;margin:0 auto;color:${MAIL.texte};">
  <div style="background:${MAIL.marque};padding:18px 22px 16px;border-radius:14px 14px 0 0;border-bottom:3px solid ${MAIL.or};">
    ${logoMail(o.mention || '')}
    ${o.titre ? `<div style="color:#ffffff;font-weight:800;font-size:18px;line-height:1.3;margin-top:12px;">${o.titre}</div>` : ''}
  </div>
  <div style="background:#ffffff;border:1px solid ${MAIL.trait};border-top:none;border-radius:0 0 14px 14px;padding:20px 22px;font-size:14.5px;line-height:1.65;color:${MAIL.texte};">
    ${o.corps}
    ${o.pied ? `<div style="margin-top:18px;font-size:12px;color:${MAIL.plumeClair};">${o.pied}</div>` : ''}
  </div>
</div>`;
}
