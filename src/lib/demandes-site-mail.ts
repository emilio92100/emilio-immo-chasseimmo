/* ═══ Le mail « Nouvelle demande du site » (V3.37) ═════════════════════════
   Ce qu'Alexandre reçoit quand un formulaire du site arrive : le type, le nom,
   les coordonnées, les réponses rangées comme dans la rubrique, le message,
   et « Ouvrir dans le CRM » (la demande s'ouvre directement). Envoyé par
   /api/demandes-site/notifier. Sans dépendance : testable seul. */

import {
  categorieDe, emailUtile, joliTel, presenter, telUtile,
  type DemandeSite,
} from '@/lib/demandes-site';

/* L'heure de Paris : le serveur (Vercel) compte en UTC, et un mail qui dit
   « 10:26 » pour une demande arrivée à 12:26 ferait douter du reste. */
const dateParis = (iso: string) => {
  const d = new Date(iso);
  const jour = d.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Europe/Paris' });
  const heure = d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Paris' });
  return `${jour} à ${heure}`;
};

export const CRM = () => (process.env.CRM_URL || 'https://emilio-immo-chasseimmo.vercel.app').replace(/\/$/, '');

/* ── Le réglage (V3.50) ──
   Ce mail se coupe comme les autres alertes (Paramètres › Alertes mail, et
   « Tout couper ») : même ligne `parametres` « alertes_mail », clé
   « demande_site » à false. Avant, il partait toujours. Dans le doute (valeur
   illisible), il part : une alerte de trop vaut mieux qu'une perdue. */
export const CLE_ALERTE_DEMANDE = 'demande_site';
export function alerteDemandeCoupee(valeur: string | null | undefined): boolean {
  if (!valeur) return false;
  try {
    const o = JSON.parse(valeur);
    return !!o && typeof o === 'object' && (o as Record<string, unknown>)[CLE_ALERTE_DEMANDE] === false;
  } catch { return false; }
}

const echapper = (t: string) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const html = (t: string) => echapper(t).replace(/\n/g, '<br>');

export function mailDemande(d: DemandeSite): { sujet: string; html: string; texte: string } {
  const cat = categorieDe(d.form_type);
  const p = presenter(d);
  const lien = `${CRM()}/?page=demandes&demande=${encodeURIComponent(d.id)}`;
  const tel = telUtile(d.phone) ? joliTel(d.phone) : (d.phone || '');
  const mail = emailUtile(d.email) ? d.email.trim() : '';
  const lignes: [string, string][] = [
    ['Téléphone', tel || '—'],
    ['E-mail', mail || d.email || '—'],
    ...p.rubriques.flatMap(r => [
      ...r.champs.map(c => [c.l, c.v] as [string, string]),
      ...(r.puces && r.puces.length ? [[r.titre, r.puces.map((x, i) => (r.numerotees ? `${i + 1}. ${x}` : x)).join(' · ')] as [string, string]] : []),
    ]),
    ...(p.bien ? [['Bien', `${p.bien.titre}${p.bien.ref ? ` (réf. ${p.bien.ref})` : ''}`] as [string, string]] : []),
    ...(p.dvf ? [['Estimation DVF du site', p.dvf.fourchette || 'non disponible'] as [string, string]] : []),
  ];
  const sujet = `Nouvelle demande du site — ${cat.lib} — ${d.name || 'sans nom'}`;
  const texte = [
    `Nouvelle demande reçue sur emilio-immo.com (${cat.lib.toLowerCase()}), le ${dateParis(d.created_at)}.`,
    '',
    d.name || 'Sans nom',
    ...lignes.map(([l, v]) => `${l} : ${v}`),
    ...(p.message ? ['', 'Son message :', p.message] : []),
    '',
    `L'ouvrir dans le CRM : ${lien}`,
  ].join('\n');
  const corps = `<!doctype html><html lang="fr"><body style="margin:0;padding:24px 12px;background:#f3f5f9;font-family:Arial,Helvetica,sans-serif;color:#1f2d44">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;margin:0 auto;background:#ffffff;border-radius:14px;overflow:hidden;border:1px solid #e3e8f0">
<tr><td style="background:#2e4166;padding:20px 24px;color:#ffffff">
<div style="font-size:12px;letter-spacing:1px;text-transform:uppercase;color:#e8c96a;font-weight:bold">Nouvelle demande du site · ${echapper(cat.lib)}</div>
<div style="font-size:22px;font-weight:bold;margin-top:6px">${echapper(d.name || 'Sans nom')}</div>
<div style="font-size:13px;color:#c9d3e3;margin-top:4px">Reçue le ${echapper(dateParis(d.created_at))}</div>
</td></tr>
<tr><td style="padding:18px 24px 6px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="font-size:14px;border-collapse:collapse">
${lignes.map(([l, v]) => `<tr><td style="padding:7px 0;color:#8896a8;width:40%;vertical-align:top;border-bottom:1px solid #f1f4f8">${echapper(l)}</td><td style="padding:7px 0;font-weight:bold;vertical-align:top;border-bottom:1px solid #f1f4f8">${html(v)}</td></tr>`).join('\n')}
</table>
${p.message ? `<div style="margin-top:14px;padding:12px 14px;background:#f8fafc;border-left:3px solid #c9a84c;border-radius:8px;font-size:14px;line-height:1.55">${html(p.message)}</div>` : ''}
</td></tr>
<tr><td style="padding:14px 24px 24px">
<a href="${echapper(lien)}" style="display:inline-block;background:#2e4166;color:#ffffff;text-decoration:none;font-weight:bold;font-size:14px;padding:12px 18px;border-radius:10px">Ouvrir dans le CRM</a>
${tel ? `<a href="tel:${echapper(tel.replace(/\s/g, ''))}" style="display:inline-block;margin-left:8px;background:#c9a84c;color:#1a2332;text-decoration:none;font-weight:bold;font-size:14px;padding:12px 18px;border-radius:10px">Appeler</a>` : ''}
</td></tr>
</table></body></html>`;
  return { sujet, html: corps, texte };
}
