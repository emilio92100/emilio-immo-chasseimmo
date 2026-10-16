import { IMAGES_MAIL, LIEN_POLICE_MAIL, LOGO_BLANC_MAIL, MAIL, POLICE_MAIL } from '@/lib/mail-charte';
import { criteresAgence, type CritereAgence, type ResumeAgence } from '@/lib/agences-lien';

/* ═══ Le mail du lien pour les agences (V3.198) ═══════════════════════════
   Alexandre : « le mail qu'il reçoit, est-ce qu'il est bien joli ? avec de
   beaux icônes ». Maquettes 7 et 8 du canevas « Le lien pour les agences »,
   validées le 15 octobre : la bande bleue au logo, « Un bien pour mon
   client ? », ce qu'il cherche (sans son nom), le gros bouton orange,
   « Comment ça marche », la signature.

   Écrit pour les messageries : des tableaux, des styles en ligne, des
   icônes en PNG (public/mail/agence/, dessinées en 2x) chargées depuis
   espace.emilio-immo.com (IMAGES_MAIL), pas de texte caché,
   jamais de SVG (Gmail les retire). Les critères vont deux par deux sur
   ordinateur et passent l'un sous l'autre sur un téléphone, sans media
   query (des blocs en ligne de 246 px au plus). */

const echappe = (t: string) => String(t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const ICO = `${IMAGES_MAIL}/mail/agence`;
const TEL = '06 58 95 76 32';
const TEL_URL = '+33658957632';
const MAIL_ALEX = 'arogelet@emilio-immo.com';

export const SUJET_AGENCE = 'Un bien pour mon client ? Voici le lien pour me le proposer';

/** « Bonjour Julien, », « Bonjour M. Arnaud, », « Bonjour, ». */
export function bonjourAgence(interlocuteur?: string | null): string {
  const i = String(interlocuteur || '').trim();
  if (!i) return 'Bonjour,';
  return /^(M\.|Mme|Mlle|Monsieur|Madame)\s/i.test(i) ? `Bonjour ${i},` : `Bonjour ${i.split(/\s+/)[0]},`;
}

/* Les critères (le type et les pièces, la surface, les secteurs, le budget) :
   src/lib/agences-lien.ts, les mêmes que sur la page de l'agence (V3.202). */
type Critere = CritereAgence;
const criteres = (r: ResumeAgence): Critere[] => criteresAgence(r);

const ETAPES = [
  { ico: 'etape-lien', t: 'Collez votre annonce', s: 'Votre site, SeLoger, Leboncoin… ou sa plaquette PDF, ou des photos.' },
  { ico: 'etape-lue', t: 'Elle est lue toute seule', s: 'Photos, prix, surface : rien à ressaisir.' },
  { ico: 'etape-tel', t: 'Je vous rappelle', s: 'Si le bien correspond à mon client.' },
];

export function mailLienAgence(o: { lien: string; interlocuteur?: string | null; resume: ResumeAgence }): { sujet: string; html: string; texte: string } {
  const lien = echappe(o.lien);
  const lienCourt = echappe(o.lien.replace(/^https?:\/\//, ''));
  const bonjour = echappe(bonjourAgence(o.interlocuteur));
  const crit = criteres(o.resume);
  const imp = o.resume.important;
  /* V3.202 : ses précisions, quand Alexandre a choisi de les montrer (une copie). */
  const prec = o.resume.precisions || '';

  const bloc = (c: Critere) => `<div style="display:inline-block;width:100%;max-width:246px;vertical-align:top;margin:0 0 12px;">
      <table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>
        <td style="width:40px;vertical-align:middle;"><img src="${ICO}/${c.ico}.png" width="40" height="40" alt="" style="display:block;border:0;width:40px;height:40px;" /></td>
        <td style="padding-left:12px;vertical-align:middle;font-family:${POLICE_MAIL};">
          <div style="font-size:14.5px;font-weight:800;line-height:1.3;color:${c.or ? MAIL.orTexte : MAIL.encre};">${echappe(c.titre)}</div>
          <div style="font-size:13px;font-weight:600;line-height:1.4;color:${MAIL.plume};">${echappe(c.sous)}</div>
        </td></tr></table>
    </div>`;

  const html = `<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">${LIEN_POLICE_MAIL}<title>${echappe(SUJET_AGENCE)}</title>
<style>@media (max-width:480px){ .ag-pad{ padding-left:18px !important; padding-right:18px !important; } .ag-titre{ font-size:23px !important; } } @media (max-width:380px){ .ag-badge{ display:none !important; } }</style></head>
<body style="margin:0;padding:0;background:${MAIL.fondPage};">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${MAIL.fondPage};"><tr><td align="center" style="padding:24px 12px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;font-family:${POLICE_MAIL};">
  <tr><td class="ag-pad" style="background:${MAIL.marque};border-radius:18px 18px 0 0;border-bottom:3px solid ${MAIL.or};padding:24px 28px 22px;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
      <td style="vertical-align:middle;"><img src="${LOGO_BLANC_MAIL}" alt="Emilio Immobilier" height="30" style="height:30px;width:auto;display:block;border:0;color:#ffffff;font-weight:800;font-size:15px;" /></td>
      <td align="right" class="ag-badge" style="vertical-align:middle;"><span style="display:inline-block;padding:4px 10px;border-radius:99px;background:rgba(255,255,255,.12);border:1px solid rgba(255,255,255,.2);color:${MAIL.orClair};font-size:10.5px;font-weight:800;letter-spacing:1.2px;white-space:nowrap;">RECHERCHE ACQUÉREUR</span></td>
    </tr></table>
    <div class="ag-titre" style="margin-top:16px;font-size:26px;font-weight:800;line-height:1.2;color:#ffffff;">Un bien pour mon client&nbsp;?</div>
    <div style="margin-top:6px;font-size:15px;font-weight:600;line-height:1.5;color:#DCE6F3;">Déposez-le en un clic : il arrive directement chez moi.</div>
  </td></tr>
  <tr><td class="ag-pad" style="background:#ffffff;border:1px solid ${MAIL.trait};border-top:none;border-radius:0 0 18px 18px;padding:26px 28px 28px;">
    <div style="font-size:15px;font-weight:700;color:${MAIL.encre};">${bonjour}</div>
    <div style="margin-top:10px;font-size:15px;line-height:1.65;font-weight:500;color:${MAIL.texte};">Comme convenu, voici le lien pour me proposer vos biens pour mon client. Ce qu’il cherche est juste en dessous ; si vous avez quelque chose qui correspond, collez simplement le lien de votre annonce : je l’étudie et je reviens vers vous.</div>

    ${crit.length || imp.length || prec ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-top:20px;"><tr><td style="background:${MAIL.fond};border:1px solid ${MAIL.trait};border-radius:16px;padding:18px 18px 8px;">
      <div style="font-size:11.5px;font-weight:800;letter-spacing:1.3px;color:${MAIL.plume};margin-bottom:14px;">CE QUE CHERCHE MON CLIENT</div>
      ${crit.map(bloc).join('')}
      ${imp.length ? `<div style="border-top:1px solid ${MAIL.trait};padding:12px 0 10px;">
        <div style="font-size:12.5px;font-weight:700;color:${MAIL.plume};margin-bottom:8px;">Important pour lui</div>
        ${imp.map(x => `<div style="font-size:13.5px;font-weight:700;line-height:1.5;color:${MAIL.encre};margin:0 0 6px;"><img src="${ICO}/coche.png" width="16" height="16" alt="" style="width:16px;height:16px;border:0;vertical-align:-3px;margin-right:7px;" />${echappe(x)}</div>`).join('')}
      </div>` : ''}
      ${prec ? `<div style="border-top:1px solid ${MAIL.trait};padding:12px 0 12px;">
        <div style="font-size:12.5px;font-weight:700;color:${MAIL.plume};margin-bottom:8px;">Ses précisions</div>
        <div style="font-size:14px;font-weight:600;line-height:1.55;color:${MAIL.encre};background:#ffffff;border:1px solid ${MAIL.trait};border-radius:12px;padding:11px 13px;">${echappe(prec).replace(/\n/g, '<br />')}</div>
      </div>` : ''}
    </td></tr></table>` : ''}

    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-top:22px;"><tr><td align="center" style="border-radius:15px;background:${MAIL.or};">
      <a href="${lien}" target="_blank" style="display:block;padding:17px 20px;border-radius:15px;background:${MAIL.or};color:${MAIL.encre};font-family:${POLICE_MAIL};font-size:17px;font-weight:800;text-decoration:none;text-align:center;"><img src="${ICO}/fleche.png" width="20" height="20" alt="" style="width:20px;height:20px;border:0;vertical-align:-4px;margin-right:9px;" />Proposer un bien</a>
    </td></tr></table>
    <div style="margin-top:10px;text-align:center;font-size:12.5px;font-weight:600;line-height:1.5;color:#8592A6;">Le bouton ne s’ouvre pas&nbsp;? Ce lien&nbsp;: <a href="${lien}" target="_blank" style="color:${MAIL.marque};font-weight:700;text-decoration:underline;">${lienCourt}</a></div>

    <div style="margin-top:24px;font-size:11.5px;font-weight:800;letter-spacing:1.3px;color:${MAIL.plume};">COMMENT ÇA MARCHE</div>
    ${ETAPES.map(e => `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin-top:12px;"><tr>
      <td style="width:38px;vertical-align:top;"><img src="${ICO}/${e.ico}.png" width="38" height="38" alt="" style="display:block;border:0;width:38px;height:38px;" /></td>
      <td style="padding-left:12px;vertical-align:middle;">
        <div style="font-size:14px;font-weight:800;line-height:1.35;color:${MAIL.encre};">${e.t}</div>
        <div style="font-size:13px;font-weight:600;line-height:1.45;color:${MAIL.plume};">${e.s}</div>
      </td></tr></table>`).join('')}

    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-top:24px;border-top:1px solid ${MAIL.trait};"><tr>
      <td style="width:52px;padding-top:18px;vertical-align:middle;">
        <table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr><td width="52" height="52" align="center" style="width:52px;height:52px;border-radius:26px;background:${MAIL.marque};color:#ffffff;font-size:17px;font-weight:800;font-family:${POLICE_MAIL};">AR</td></tr></table>
      </td>
      <td style="padding:18px 0 0 14px;vertical-align:middle;">
        <div style="font-size:15.5px;font-weight:800;color:${MAIL.encre};">Alexandre Rogelet</div>
        <div style="font-size:13px;font-weight:600;color:${MAIL.plume};">Chasseur immobilier · Emilio Immobilier</div>
        <div style="margin-top:5px;font-size:13px;font-weight:800;line-height:1.5;"><a href="tel:${TEL_URL}" style="color:${MAIL.marque};text-decoration:none;white-space:nowrap;"><img src="${ICO}/tel.png" width="14" height="14" alt="" style="width:14px;height:14px;border:0;vertical-align:-2px;margin-right:6px;" />${TEL}</a></div>
        <div style="font-size:13px;font-weight:700;line-height:1.5;"><a href="mailto:${MAIL_ALEX}" style="color:${MAIL.marque};text-decoration:none;"><img src="${ICO}/mail.png" width="14" height="14" alt="" style="width:14px;height:14px;border:0;vertical-align:-2px;margin-right:6px;" />${MAIL_ALEX}</a></div>
      </td>
    </tr></table>
  </td></tr>
  <tr><td align="center" style="padding:16px 20px 0;font-size:12px;font-weight:600;line-height:1.5;color:${MAIL.plumeClair};">Emilio Immobilier · Vanves · Ce lien vaut pour ce client seulement ; ce que vous y déposez n’est vu que par Alexandre.</td></tr>
</table>
</td></tr></table>
</body></html>`;

  const texte = [
    bonjourAgence(o.interlocuteur),
    '',
    'Comme convenu, voici le lien pour me proposer vos biens pour mon client :',
    o.lien,
    '',
    'Ce qu’il cherche :',
    ...crit.map(c => `- ${c.titre}${c.sous && !/^(Le type de bien|Le bien|Surface habitable|Les secteurs|Budget maximum)$/.test(c.sous) ? ` (${c.sous})` : ''}`),
    ...(imp.length ? ['Important pour lui :', ...imp.map(x => `- ${x}`)] : []),
    ...(prec ? ['Ses précisions :', prec] : []),
    '',
    'Il suffit d’y coller le lien de votre annonce (votre site, SeLoger, Leboncoin…), sa plaquette PDF ou quelques photos : elle arrive directement chez moi, je l’étudie et je reviens vers vous.',
    '',
    'Alexandre Rogelet',
    'Chasseur immobilier · Emilio Immobilier',
    `${TEL} · ${MAIL_ALEX}`,
  ].join('\n');

  return { sujet: SUJET_AGENCE, html, texte };
}
