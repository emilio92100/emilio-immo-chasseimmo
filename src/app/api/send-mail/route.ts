import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

const FROM_EMAIL = process.env.MAILJET_FROM_EMAIL || 'arogelet@emilio-immo.com';
const FROM_NAME = process.env.MAILJET_FROM_NAME || 'Alexandre ROGELET — Emilio Immobilier';
const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://emilio-immo-chasseimmo.vercel.app';

const BLEU = '#1a2332';
const DORE = '#c9a84c';
const FOND = '#f5f1ea';

interface BienLite {
  id: string;
  titre?: string | null;
  ville?: string | null;
  code_postal?: string | null;
  type_bien?: string | null;
  surface?: number | null;
  nb_pieces?: number | null;
  nb_chambres?: number | null;
  etage?: number | null;
  prix_vendeur?: number | null;
  prix_acquereur?: number | null;
  photos?: string[] | null;
}

function fmt(n?: number | null) {
  if (!n) return null;
  return new Intl.NumberFormat('fr-FR').format(n);
}

function escapeHtml(s: string) {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function buildHtml(opts: { prenom: string; corps: string; biens: BienLite[] }): string {
  const { corps, biens } = opts;
  const corpsHtml = escapeHtml(corps).replace(/\n/g, '<br/>');
  const single = biens.length === 1;

  const BEIGE = '#e7e1d4';
  const BORD = '#e3d8c4';

  const photoOf = (b: BienLite) => (Array.isArray(b.photos) && b.photos.length > 0 ? b.photos[0] : null);
  const titreOf = (b: BienLite) => b.titre || `${b.type_bien || 'Bien'}${b.surface ? ` de ${b.surface} m²` : ''}`;
  const locOf = (b: BienLite) => [b.code_postal, b.ville].filter(Boolean).join(' ');
  const prixOf = (b: BienLite) => b.prix_acquereur || b.prix_vendeur;
  const etageOf = (b: BienLite) => {
    const e = (b as { etage?: number | null }).etage;
    if (e === 0) return 'RDC';
    if (e) return `${e}ème`;
    return '';
  };

  function bigCard(b: BienLite): string {
    const photo = photoOf(b);
    const prix = prixOf(b);
    const loc = locOf(b);
    const etageTxt = etageOf(b);
    const cells: { v: string; l: string }[] = [];
    if (b.surface) cells.push({ v: `${b.surface} m²`, l: 'Surface' });
    if (b.nb_pieces) cells.push({ v: `${b.nb_pieces}`, l: b.nb_pieces > 1 ? 'Pièces' : 'Pièce' });
    if (b.nb_chambres) cells.push({ v: `${b.nb_chambres}`, l: b.nb_chambres > 1 ? 'Chambres' : 'Chambre' });
    if (etageTxt) cells.push({ v: etageTxt, l: 'Étage' });
    const statsRow = cells.map((c, i) => `${i > 0 ? '<td width="1" style="background:#f0ece3;"></td>' : ''}<td align="center" style="padding:4px 6px;"><div style="font-size:17px;font-weight:700;color:${BLEU};">${c.v}</div><div style="font-size:11px;color:#9aa6ba;margin-top:2px;">${c.l}</div></td>`).join('');
    return `
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#ffffff;border:1px solid ${BORD};border-radius:16px;overflow:hidden;">
        <tr><td style="padding:0;">
          ${photo ? `<img src="${escapeHtml(photo)}" alt="" width="600" style="width:100%;max-width:600px;height:auto;display:block;border:0;" />` : `<div style="height:220px;background:${BLEU};"></div>`}
        </td></tr>
        <tr><td style="padding:24px 26px;">
          <div style="font-size:19px;font-weight:700;color:${BLEU};line-height:1.3;margin-bottom:6px;">${escapeHtml(titreOf(b))}</div>
          ${loc ? `<div style="font-size:13px;color:#7a879b;margin-bottom:18px;"><span style="color:${DORE};">&#9679;</span> ${escapeHtml(loc)}</div>` : '<div style="height:8px;"></div>'}
          ${statsRow ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-top:1px solid #f0ece3;border-bottom:1px solid #f0ece3;margin-bottom:20px;"><tr>${statsRow}</tr></table>` : ''}
          ${prix ? `<div style="font-size:26px;font-weight:800;color:${BLEU};line-height:1;">${fmt(prix)} €</div><div style="font-size:11px;color:${DORE};font-weight:600;letter-spacing:0.3px;margin:6px 0 20px;">${b.prix_acquereur ? 'Prix FAI · honoraires inclus' : 'Prix'}</div>` : '<div style="height:8px;"></div>'}
          <a href="${SITE_URL}/bien/${b.id}" style="display:block;background:${BLEU};color:#ffffff;text-decoration:none;text-align:center;padding:15px;border-radius:11px;font-size:15px;font-weight:600;">Consulter le bien &rarr;</a>
        </td></tr>
      </table>`;
  }

  function compactCard(b: BienLite): string {
    const photo = photoOf(b);
    const prix = prixOf(b);
    const loc = locOf(b);
    const etageTxt = etageOf(b);
    const carac = [b.surface ? `${b.surface} m²` : '', b.nb_pieces ? `${b.nb_pieces} p.` : '', b.nb_chambres ? `${b.nb_chambres} ch.` : '', etageTxt ? `${etageTxt} ét.` : ''].filter(Boolean).join(' · ');
    return `
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" class="bcard" style="background:#ffffff;border:1px solid ${BORD};border-radius:14px;overflow:hidden;margin-bottom:14px;"><tr>
        <td width="160" class="bphoto" style="padding:0;vertical-align:top;">
          ${photo ? `<img src="${escapeHtml(photo)}" alt="" width="160" class="bimg" style="width:160px;height:100%;min-height:140px;object-fit:cover;display:block;border:0;" />` : `<div class="bimg" style="width:160px;height:140px;background:${BLEU};"></div>`}
        </td>
        <td class="bcontent" style="padding:16px 18px;vertical-align:top;">
          <div style="font-size:15px;font-weight:700;color:${BLEU};margin-bottom:3px;">${escapeHtml(titreOf(b))}</div>
          ${loc ? `<div style="font-size:12px;color:#7a879b;margin-bottom:8px;"><span style="color:${DORE};">&#9679;</span> ${escapeHtml(loc)}</div>` : ''}
          ${carac ? `<div style="font-size:12px;color:#5a6a85;margin-bottom:12px;">${escapeHtml(carac)}</div>` : ''}
          ${prix ? `<div style="font-size:18px;font-weight:800;color:${BLEU};margin-bottom:12px;">${fmt(prix)} €</div>` : ''}
          <a href="${SITE_URL}/bien/${b.id}" style="display:block;background:${BLEU};color:#ffffff;text-decoration:none;text-align:center;padding:11px;border-radius:9px;font-size:13px;font-weight:600;">Consulter &rarr;</a>
        </td>
      </tr></table>`;
  }

  const cardsHtml = single ? bigCard(biens[0]) : biens.map(compactCard).join('');
  const spacer = '<tr><td height="14" style="height:14px;line-height:14px;font-size:0;">&nbsp;</td></tr>';

  return `<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width,initial-scale=1" />
<title>Emilio Immobilier</title>
<style>
  @media only screen and (max-width:600px) {
    .wrap { width:100% !important; }
    .px { padding-left:18px !important; padding-right:18px !important; }
    .bphoto, .bcontent { display:block !important; width:100% !important; }
    .bphoto .bimg { width:100% !important; height:190px !important; }
  }
</style>
</head>
<body style="margin:0;padding:0;background:#e7e1d4;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#e7e1d4;">
    <tr><td align="center" style="padding:24px 12px;">
      <table role="presentation" width="600" class="wrap" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;width:100%;">

        <!-- HEADER -->
        <tr><td style="background:${BLEU};border-radius:16px;border-bottom:3px solid ${DORE};padding:20px 28px;">
          <table role="presentation" width="100%"><tr>
            <td style="font-size:18px;font-weight:700;color:#ffffff;letter-spacing:0.5px;">Emilio <span style="color:${DORE};">Immobilier</span></td>
            <td align="right" style="font-size:10px;color:${DORE};letter-spacing:2.5px;font-weight:600;">SÉLECTION PRIVÉE</td>
          </tr></table>
        </td></tr>
        ${spacer}

        <!-- MESSAGE -->
        <tr><td class="px" style="background:#ffffff;border:1px solid ${BORD};border-radius:16px;padding:26px 28px;">
          <div style="font-size:14.5px;color:#3a4a5f;line-height:1.7;">${corpsHtml}</div>
        </td></tr>
        ${biens.length > 0 ? spacer : ''}

        <!-- BIENS -->
        ${biens.length > 0 ? `<tr><td>${cardsHtml}</td></tr>` : ''}
        ${spacer}

        <!-- FOOTER -->
        <tr><td style="background:${BLEU};border-radius:16px;padding:20px 28px;">
          <table role="presentation" width="100%"><tr>
            <td>
              <div style="font-size:14px;font-weight:700;color:#ffffff;">Alexandre Rogelet</div>
              <div style="font-size:11px;color:rgba(255,255,255,0.55);margin-top:3px;">Chasse immobilière sur mesure · Paris &amp; Hauts-de-Seine</div>
            </td>
            <td align="right" style="color:${DORE};font-size:15px;font-weight:700;white-space:nowrap;">06 58 95 76 32</td>
          </tr></table>
        </td></tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`;
}



export async function POST(req: NextRequest) {
  try {
    const apiKey = process.env.MAILJET_API_KEY;
    const apiSecret = process.env.MAILJET_API_SECRET;
    if (!apiKey || !apiSecret) {
      return NextResponse.json({ error: 'Mailjet non configuré (clés manquantes)' }, { status: 500 });
    }

    const body = await req.json();
    const { client_ids, recherche_id, objet, corps, biens_ids, destinataires_override, mode } = body as {
      client_ids: string[];
      recherche_id?: string;
      objet: string;
      corps: string;
      biens_ids?: string[];           // Optionnel : si fourni, on n'envoie que ces biens
      destinataires_override?: string[]; // Optionnel : override des emails par défaut du client
      mode?: 'libre' | 'biens';       // 'libre' = pas de biens (mail texte), 'biens' = avec biens (défaut)
    };

    if (!Array.isArray(client_ids) || client_ids.length === 0) {
      return NextResponse.json({ error: 'Aucun destinataire' }, { status: 400 });
    }
    if (!objet?.trim()) {
      return NextResponse.json({ error: "L'objet est obligatoire" }, { status: 400 });
    }

    // Récupère clients
    const { data: clients } = await supabase
      .from('clients')
      .select('id, prenom, nom, emails')
      .in('id', client_ids);

    if (!clients || clients.length === 0) {
      return NextResponse.json({ error: 'Clients introuvables' }, { status: 404 });
    }

    // Récupère les biens UNIQUEMENT si mode != 'libre'
    let tousBiens: (BienLite & { client_id: string })[] = [];
    if (mode !== 'libre') {
      let query = supabase
        .from('biens')
        .select('id, client_id, titre, ville, code_postal, type_bien, surface, nb_pieces, nb_chambres, etage, prix_vendeur, prix_acquereur, photos, badge_retour')
        .in('client_id', client_ids)
        .order('created_at', { ascending: false });

      // Si biens_ids fourni → on filtre sur ces biens-là seulement
      if (Array.isArray(biens_ids) && biens_ids.length > 0) {
        query = query.in('id', biens_ids);
      } else {
        // Sinon, on prend tous les biens actifs (non refusés)
        query = query.neq('badge_retour', 'refuse');
      }

      const { data } = await query;
      tousBiens = (data || []) as (BienLite & { client_id: string })[];
    }

    const auth = Buffer.from(`${apiKey}:${apiSecret}`).toString('base64');
    const results: { client_id: string; success: boolean; error?: string }[] = [];

    for (const client of clients) {
      // Si override fourni → utiliser cette liste, sinon les emails du client
      const sourceEmails = Array.isArray(destinataires_override) && destinataires_override.length > 0
        ? destinataires_override
        : (client.emails || []);
      const emails = sourceEmails.filter((e: string) => e && e.includes('@'));
      if (emails.length === 0) {
        results.push({ client_id: client.id, success: false, error: 'Pas d\'email valide' });
        continue;
      }

      const biensClient = tousBiens.filter(b => b.client_id === client.id);
      const corpsPerso = corps.replace(/\{\{prénom\}\}/g, client.prenom);
      const html = buildHtml({ prenom: client.prenom, corps: corpsPerso, biens: biensClient });
      const text = `Bonjour ${client.prenom},\n\n${corpsPerso}\n\n${biensClient.length > 0 ? `Biens proposés :\n${biensClient.map(b => `- ${b.titre || 'Bien'} : ${SITE_URL}/bien/${b.id}`).join('\n')}\n\n` : ''}Cordialement,\nAlexandre ROGELET — Emilio Immobilier\n06 58 95 76 32`;

      try {
        const mjRes = await fetch('https://api.mailjet.com/v3.1/send', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Basic ${auth}`,
          },
          body: JSON.stringify({
            Messages: [{
              From: { Email: FROM_EMAIL, Name: FROM_NAME },
              To: emails.map((e: string) => ({ Email: e, Name: `${client.prenom} ${client.nom}` })),
              Subject: objet,
              TextPart: text,
              HTMLPart: html,
              CustomID: `chasse-${client.id}-${Date.now()}`,
              TrackOpens: 'disabled',
              TrackClicks: 'disabled',
            }],
          }),
        });

        const mjJson = await mjRes.json();
        const ok = mjRes.ok && mjJson?.Messages?.[0]?.Status === 'success';

        if (ok) {
          const typeEnvoi = biensClient.length === 0 ? 'mail_libre' : biensClient.length === 1 ? 'envoi_bien' : 'selection_biens';
          await supabase.from('envois').insert({
            client_id: client.id,
            recherche_id: recherche_id || null,
            type: typeEnvoi,
            objet,
            corps: corpsPerso,
            destinataires: emails,
            biens_ids: biensClient.map(b => b.id),
            sms_envoye: false,
          });
          const titreJournal = biensClient.length === 0
            ? `✉️ Mail envoyé — ${objet}`
            : biensClient.length === 1
              ? `📤 Bien envoyé — ${biensClient[0].titre || biensClient[0].ville || 'bien'}`
              : `📤 Sélection envoyée — ${biensClient.length} biens`;
          await supabase.from('journal').insert({
            client_id: client.id,
            type: biensClient.length === 0 ? 'mail_envoye' : 'envoi_bien',
            titre: titreJournal,
            description: `À : ${emails.join(', ')}\n\n${corpsPerso}${biensClient.length > 0 ? `\n\nBiens joints : ${biensClient.length}` : ''}`,
          });
          results.push({ client_id: client.id, success: true });
        } else {
          const errMsg = mjJson?.Messages?.[0]?.Errors?.[0]?.ErrorMessage || JSON.stringify(mjJson).slice(0, 200);
          results.push({ client_id: client.id, success: false, error: errMsg });
        }
      } catch (e) {
        results.push({ client_id: client.id, success: false, error: (e as Error).message });
      }
    }

    const okCount = results.filter(r => r.success).length;
    return NextResponse.json({
      success: okCount > 0,
      sent: okCount,
      total: results.length,
      results,
    });

  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
