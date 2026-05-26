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
  const corpsHtml = escapeHtml(opts.corps).replace(/\n/g, '<br/>');

  const bienCards = opts.biens.map(b => {
    const prix = b.prix_acquereur || b.prix_vendeur;
    const labelPrix = b.prix_acquereur ? 'Prix FAI' : 'Prix';
    const photo = Array.isArray(b.photos) && b.photos.length > 0 ? b.photos[0] : null;
    const titre = b.titre || `${b.type_bien || 'Bien'}${b.surface ? ` de ${b.surface}m²` : ''}`;
    const localisation = [b.code_postal, b.ville].filter(Boolean).join(' ');
    const carac = [
      b.surface && `${b.surface} m²`,
      b.nb_pieces && `${b.nb_pieces} pièces`,
      b.nb_chambres && `${b.nb_chambres} chambres`,
    ].filter(Boolean).join(' · ');

    return `
      <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="margin-bottom:16px;background:#ffffff;border-radius:12px;overflow:hidden;border:1px solid #e5e7eb;">
        <tr>
          ${photo ? `
          <td width="180" style="vertical-align:top;">
            <img src="${escapeHtml(photo)}" alt="" width="180" style="width:180px;height:180px;object-fit:cover;display:block;border:0;" />
          </td>
          ` : ''}
          <td style="padding:18px 20px;vertical-align:top;">
            <div style="font-size:11px;color:${DORE};letter-spacing:1.5px;text-transform:uppercase;font-weight:700;margin-bottom:6px;">Bien sélectionné</div>
            <div style="font-size:17px;font-weight:700;color:${BLEU};line-height:1.3;margin-bottom:6px;">${escapeHtml(titre)}</div>
            ${localisation ? `<div style="font-size:13px;color:#64748b;margin-bottom:10px;">📍 ${escapeHtml(localisation)}</div>` : ''}
            ${carac ? `<div style="font-size:13px;color:#475569;margin-bottom:12px;">${escapeHtml(carac)}</div>` : ''}
            ${prix ? `<div style="font-size:20px;font-weight:800;color:${BLEU};margin-bottom:14px;">${fmt(prix)} €${b.prix_acquereur ? ` <span style="font-size:11px;color:#94a3b8;font-weight:500;">${labelPrix}</span>` : ''}</div>` : ''}
            <a href="${SITE_URL}/bien/${b.id}" style="display:inline-block;background:${BLEU};color:#ffffff;text-decoration:none;padding:10px 22px;border-radius:24px;font-size:13px;font-weight:600;">Consulter le bien →</a>
          </td>
        </tr>
      </table>
    `;
  }).join('');

  return `<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width,initial-scale=1" />
<title>Emilio Immobilier</title>
</head>
<body style="margin:0;padding:0;background:${FOND};font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="background:${FOND};">
    <tr><td align="center" style="padding:32px 12px;">
      <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="600" style="max-width:600px;width:100%;">

        <!-- HEADER -->
        <tr><td style="background:${BLEU};border-radius:12px 12px 0 0;padding:28px 32px;border-bottom:3px solid ${DORE};">
          <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%">
            <tr>
              <td>
                <img src="${SITE_URL}/logo_high_resolution_white.png" alt="Emilio Immobilier" height="44" style="height:44px;width:auto;display:block;border:0;" />
              </td>
              <td align="right" style="color:#ffffff;">
                <div style="font-size:10px;color:${DORE};letter-spacing:1.5px;text-transform:uppercase;font-weight:700;">Chasseur immobilier</div>
                <div style="font-size:13px;opacity:0.85;margin-top:2px;">Sélection privée</div>
              </td>
            </tr>
          </table>
        </td></tr>

        <!-- MESSAGE -->
        <tr><td style="background:#ffffff;padding:32px;">
          <div style="font-size:15px;color:#334155;line-height:1.7;">${corpsHtml}</div>
        </td></tr>

        ${opts.biens.length > 0 ? `
        <!-- BIENS -->
        <tr><td style="background:#ffffff;padding:0 24px 24px 24px;">
          <div style="font-size:11px;color:${DORE};letter-spacing:2px;text-transform:uppercase;font-weight:700;margin-bottom:14px;padding-top:8px;border-top:1px solid #f1f5f9;padding-top:24px;">
            ${opts.biens.length === 1 ? 'Le bien' : `Les ${opts.biens.length} biens`} que je vous propose
          </div>
          ${bienCards}
        </td></tr>
        ` : ''}

        <!-- CONTACT BAR -->
        <tr><td style="background:${BLEU};padding:24px 32px;text-align:center;">
          <div style="font-size:11px;color:${DORE};letter-spacing:2px;text-transform:uppercase;font-weight:700;margin-bottom:8px;">Une question ?</div>
          <div style="font-size:14px;color:#ffffff;margin-bottom:14px;">Je reste à votre disposition</div>
          <a href="tel:+33658957632" style="display:inline-block;background:${DORE};color:${BLEU};text-decoration:none;padding:10px 22px;border-radius:24px;font-size:13px;font-weight:700;margin:0 4px;">📞 06 58 95 76 32</a>
          <a href="mailto:arogelet@emilio-immo.com" style="display:inline-block;background:rgba(255,255,255,0.1);color:#ffffff;text-decoration:none;padding:10px 22px;border-radius:24px;font-size:13px;font-weight:600;margin:0 4px;border:1px solid rgba(255,255,255,0.3);">✉️ Me répondre</a>
        </td></tr>

        <!-- FOOTER -->
        <tr><td style="background:${BLEU};border-radius:0 0 12px 12px;padding:20px 32px;text-align:center;border-top:1px solid rgba(201,168,76,0.2);">
          <div style="color:${DORE};font-size:13px;font-weight:700;margin-bottom:4px;">Emilio Immobilier</div>
          <div style="color:rgba(255,255,255,0.5);font-size:11px;">Chasse immobilière sur mesure · Paris &amp; région</div>
        </td></tr>

        <tr><td style="padding:16px;text-align:center;color:#94a3b8;font-size:11px;">
          Cet email vous a été envoyé personnellement dans le cadre de votre mandat de recherche.
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
    const { client_ids, objet, corps, biens_ids, destinataires_override, mode } = body as {
      client_ids: string[];
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
        .select('id, client_id, titre, ville, code_postal, type_bien, surface, nb_pieces, nb_chambres, prix_vendeur, prix_acquereur, photos, badge_retour')
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
            }],
          }),
        });

        const mjJson = await mjRes.json();
        const ok = mjRes.ok && mjJson?.Messages?.[0]?.Status === 'success';

        if (ok) {
          const typeEnvoi = biensClient.length === 0 ? 'mail_libre' : biensClient.length === 1 ? 'envoi_bien' : 'selection_biens';
          await supabase.from('envois').insert({
            client_id: client.id,
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
