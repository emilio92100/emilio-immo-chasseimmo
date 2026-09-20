import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

/**
 * Tout ce que l'espace acheteur écrit passe par ici.
 *
 *   POST /api/espace/vue       { token, bien_id }
 *   POST /api/espace/retour    { token, bien_id, avis, commentaire }
 *   POST /api/espace/criteres  { token, criteres }
 *   POST /api/espace/message   { token, texte }
 *   POST /api/espace/partage   { token, bien_id, destinataire }
 *
 * Chaque appel revérifie le lien : sans lui, rien ne s'écrit.
 * La route est publique (voir src/proxy.ts) mais le lien fait la serrure.
 */

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

const SITE = process.env.NEXT_PUBLIC_SITE_URL || 'https://emilio-immo-chasseimmo.vercel.app';
const FROM_EMAIL = process.env.MAILJET_FROM_EMAIL || 'arogelet@emilio-immo.com';
const FROM_NAME = process.env.MAILJET_FROM_NAME || 'Alexandre ROGELET — Emilio Immobilier';

function base() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}

const AVIS_OK = ['interesse', 'souhaite_visiter', 'refuse'];
const nettoie = (s: unknown, max = 600) =>
  typeof s === 'string' ? s.replace(/\s+/g, ' ').trim().slice(0, max) : '';

export async function POST(req: NextRequest, ctx: { params: Promise<{ action: string }> }) {
  try {
    const { action } = await ctx.params;
    const body = await req.json();
    const token = typeof body?.token === 'string' ? body.token : '';
    if (!token || token.length < 32) {
      return NextResponse.json({ ok: false, error: 'lien invalide' }, { status: 401 });
    }

    const supabase = base();

    // ─── la serrure : le lien doit exister et l'espace être actif ───
    const { data: recherche } = await supabase
      .from('recherches')
      .select('id, client_id, espace_actif, secteurs, notes')
      .eq('token_espace', token)
      .maybeSingle();

    if (!recherche || recherche.espace_actif === false) {
      return NextResponse.json({ ok: false, error: 'lien invalide' }, { status: 401 });
    }

    const evt = (type: string, detail: string | null, bien_id?: string | null) =>
      supabase.from('espace_evenements').insert({
        recherche_id: recherche.id, client_id: recherche.client_id, bien_id: bien_id || null, type, detail,
      });

    // le bien doit appartenir à CETTE recherche
    async function bienDeLaRecherche(id: unknown) {
      if (typeof id !== 'string' || !id) return null;
      const { data } = await supabase.from('biens')
        .select('id, titre, surface, prix_acquereur, prix_vendeur, nb_vues, recherche_id')
        .eq('id', id).eq('recherche_id', recherche!.id).maybeSingle();
      return data || null;
    }

    switch (action) {

      /* ── le client a ouvert une fiche ───────────────────────── */
      case 'vue': {
        const bien = await bienDeLaRecherche(body.bien_id);
        if (!bien) return NextResponse.json({ ok: false, error: 'bien inconnu' }, { status: 404 });
        await supabase.from('biens').update({
          vu_le: new Date().toISOString(), nb_vues: (bien.nb_vues || 0) + 1,
        }).eq('id', bien.id);
        await evt('fiche', bien.titre || null, bien.id);
        return NextResponse.json({ ok: true });
      }

      /* ── son avis sur un bien ───────────────────────────────── */
      case 'retour': {
        const bien = await bienDeLaRecherche(body.bien_id);
        if (!bien) return NextResponse.json({ ok: false, error: 'bien inconnu' }, { status: 404 });
        const avis = AVIS_OK.includes(body.avis) ? body.avis : null;
        if (!avis) return NextResponse.json({ ok: false, error: 'avis inconnu' }, { status: 400 });
        const com = nettoie(body.commentaire, 500);
        const libelle = avis === 'interesse' ? '👍 Ça lui plaît'
          : avis === 'souhaite_visiter' ? '👀 Il veut visiter' : '👎 Pas pour lui';

        await supabase.from('biens').update({
          badge_retour: avis, retour_client: com || null, retour_le: new Date().toISOString(),
        }).eq('id', bien.id);

        await supabase.from('journal').insert({
          client_id: recherche.client_id, bien_id: bien.id, recherche_id: recherche.id,
          type: 'retour_client', titre: `${libelle} — depuis son espace`,
          description: com || null, metadata: {},
        });
        await evt('avis', `${libelle}${com ? ' · ' + com : ''}`, bien.id);
        return NextResponse.json({ ok: true });
      }

      /* ── il fait évoluer ses critères ───────────────────────── */
      case 'criteres': {
        const c = body.criteres || {};
        const n = (v: unknown, min: number, max: number) => {
          const x = Number(v);
          return Number.isFinite(x) && x >= min && x <= max ? Math.round(x) : null;
        };
        const maj: Record<string, unknown> = {
          budget_min: n(c.budgetMin, 50_000, 20_000_000),
          budget_max: n(c.budgetMax, 50_000, 20_000_000),
          surface_min: n(c.surfaceMin, 5, 2_000),
          nb_pieces_min: n(c.piecesMin, 1, 20),
          chambres_min: n(c.chambresMin, 0, 20),
        };
        if (Array.isArray(c.secteurs)) {
          maj.secteurs = c.secteurs.filter((s: unknown) => typeof s === 'string').slice(0, 20);
        }
        if (Array.isArray(c.equip)) {
          const e = c.equip as string[];
          maj.terrasse = e.includes('Terrasse'); maj.balcon = e.includes('Balcon');
          maj.jardin = e.includes('Jardin');     maj.parking = e.includes('Parking');
          maj.ascenseur = e.includes('Ascenseur'); maj.cave = e.includes('Cave');
          maj.gardien = e.includes('Gardien');
        }
        Object.keys(maj).forEach(k => maj[k] === null && delete maj[k]);
        maj.updated_at = new Date().toISOString();

        await supabase.from('recherches').update(maj).eq('id', recherche.id);

        const resume = [
          maj.budget_min && maj.budget_max
            ? `budget ${Number(maj.budget_min).toLocaleString('fr-FR')} – ${Number(maj.budget_max).toLocaleString('fr-FR')} €` : null,
          maj.surface_min ? `${maj.surface_min} m² min` : null,
          maj.nb_pieces_min ? `${maj.nb_pieces_min} pièces min` : null,
          maj.chambres_min != null ? `${maj.chambres_min} chambres min` : null,
        ].filter(Boolean).join(' · ');

        await supabase.from('journal').insert({
          client_id: recherche.client_id, recherche_id: recherche.id,
          type: 'criteres_modifies', titre: 'Critères modifiés par le client, depuis son espace',
          description: resume || null, metadata: {},
        });
        await evt('criteres', resume || null);
        return NextResponse.json({ ok: true });
      }

      /* ── il écrit un message ────────────────────────────────── */
      case 'message': {
        const texte = nettoie(body.texte, 1500);
        if (!texte) return NextResponse.json({ ok: false, error: 'message vide' }, { status: 400 });

        await supabase.from('journal').insert({
          client_id: recherche.client_id, recherche_id: recherche.id,
          type: 'message_client', titre: 'Message du client, depuis son espace',
          description: texte, metadata: {},
        });
        const demain = new Date(); demain.setDate(demain.getDate() + 1);
        await supabase.from('relances').insert({
          client_id: recherche.client_id, recherche_id: recherche.id,
          date_relance: demain.toISOString().split('T')[0],
          motif: 'Message depuis l’espace : ' + texte.slice(0, 180),
          statut: 'a_faire',
        });
        await evt('message', texte.slice(0, 300));
        return NextResponse.json({ ok: true });
      }

      /* ── il partage une fiche ───────────────────────────────── */
      case 'partage': {
        const bien = await bienDeLaRecherche(body.bien_id);
        if (!bien) return NextResponse.json({ ok: false, error: 'bien inconnu' }, { status: 404 });

        const dest = nettoie(body.destinataire, 160).toLowerCase();
        if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(dest)) {
          return NextResponse.json({ ok: false, error: 'adresse invalide' }, { status: 400 });
        }

        // garde-fou : pas plus de 5 partages par jour et par lien
        const depuis = new Date(Date.now() - 86_400_000).toISOString();
        const { count } = await supabase.from('espace_evenements')
          .select('id', { count: 'exact', head: true })
          .eq('recherche_id', recherche.id).eq('type', 'partage').gte('created_at', depuis);
        if ((count || 0) >= 5) {
          return NextResponse.json({ ok: false, error: 'trop de partages aujourd’hui' }, { status: 429 });
        }

        const { data: cl } = await supabase.from('clients')
          .select('prenom, nom').eq('id', recherche.client_id).maybeSingle();
        const prenom = cl?.prenom || 'Votre contact';
        const lien = `${SITE}/bien/${bien.id}`;
        const prix = bien.prix_acquereur || bien.prix_vendeur;
        const ligne = [bien.surface ? bien.surface + ' m²' : null,
          prix ? Number(prix).toLocaleString('fr-FR') + ' €' : null].filter(Boolean).join(' · ');

        const apiKey = process.env.MAILJET_API_KEY, apiSecret = process.env.MAILJET_API_SECRET;
        if (!apiKey || !apiSecret) {
          return NextResponse.json({ ok: false, error: 'envoi indisponible' }, { status: 500 });
        }
        const auth = Buffer.from(`${apiKey}:${apiSecret}`).toString('base64');

        const html = `<div style="font-family:'DM Sans',Helvetica,Arial,sans-serif;max-width:560px;margin:0 auto;color:#2f3c52">
  <div style="background:#1a2332;padding:22px 24px;border-radius:14px 14px 0 0">
    <div style="color:#c9a84c;font-weight:700;letter-spacing:2px;font-size:12px">EMILIO IMMOBILIER</div>
  </div>
  <div style="border:1px solid #e3e8f0;border-top:none;border-radius:0 0 14px 14px;padding:24px">
    <p style="margin:0 0 16px">Bonjour,</p>
    <p style="margin:0 0 20px;line-height:1.7">Voici un bien que je suis en train de regarder avec mon chasseur
      immobilier. Dites-moi ce que vous en pensez.</p>
    <div style="border:1px solid #e3e8f0;border-radius:12px;padding:16px;background:#f8fafc">
      <div style="font-weight:700;font-size:16px;color:#1a2332">${bien.titre || 'Le bien'}</div>
      ${ligne ? `<div style="color:#64748b;margin-top:6px">${ligne}</div>` : ''}
      <a href="${lien}" style="display:inline-block;margin-top:14px;background:#c9a84c;color:#fff;
        text-decoration:none;padding:11px 18px;border-radius:10px;font-weight:700">Voir la fiche</a>
    </div>
    <p style="margin:20px 0 0">${prenom}</p>
    <hr style="border:none;border-top:1px solid #e3e8f0;margin:24px 0 14px">
    <div style="font-size:12px;color:#94a3b8;line-height:1.6">
      Fiche transmise par ${prenom} · Alexandre Rogelet, chasseur immobilier · 06 58 95 76 32<br>
      Emilio Immobilier — RT Conseils · CPI 9201 2020 000 045 344
    </div>
  </div>
</div>`;

        const mj = await fetch('https://api.mailjet.com/v3.1/send', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Basic ${auth}` },
          body: JSON.stringify({
            Messages: [{
              From: { Email: FROM_EMAIL, Name: FROM_NAME },
              To: [{ Email: dest }],
              Subject: `${prenom} vous partage un bien`,
              TextPart: `Bonjour,\n\nVoici un bien que je suis en train de regarder avec mon chasseur immobilier.\n\n${bien.titre || ''}\n${ligne}\n${lien}\n\n${prenom}\n\n— Alexandre Rogelet, Emilio Immobilier, 06 58 95 76 32`,
              HTMLPart: html,
              CustomID: `partage-${bien.id}-${Date.now()}`,
              TrackOpens: 'disabled', TrackClicks: 'disabled',
            }],
          }),
        });
        const rep = await mj.json();
        const ok = mj.ok && rep?.Messages?.[0]?.Status === 'success';

        await evt('partage', `${bien.titre || 'bien'} → ${dest}${ok ? '' : ' (échec)'}`, bien.id);
        if (ok) {
          await supabase.from('journal').insert({
            client_id: recherche.client_id, bien_id: bien.id, recherche_id: recherche.id,
            type: 'partage_client', titre: 'Le client a partagé cette fiche',
            description: `Envoyée à ${dest}`, metadata: {},
          });
        }
        return NextResponse.json({ ok });
      }

      default:
        return NextResponse.json({ ok: false, error: 'action inconnue' }, { status: 404 });
    }
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
