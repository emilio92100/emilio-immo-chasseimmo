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
      .select('id, client_id, espace_actif, secteurs, notes, exigences')
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
        .select('id, titre, surface, prix_acquereur, prix_vendeur, nb_vues, vu_le, recherche_id')
        .eq('id', id).eq('recherche_id', recherche!.id).maybeSingle();
      return data || null;
    }

    switch (action) {

      /* ── le client a ouvert une fiche ───────────────────────── */
      case 'vue': {
        const bien = await bienDeLaRecherche(body.bien_id);
        if (!bien) return NextResponse.json({ ok: false, error: 'bien inconnu' }, { status: 404 });
        /* On compte CHAQUE ouverture. « vu_le » garde la toute première :
           c'est elle qui dit combien de temps il a mis à regarder. */
        await supabase.from('biens').update({
          vu_le: bien.vu_le || new Date().toISOString(),
          nb_vues: (bien.nb_vues || 0) + 1,
        }).eq('id', bien.id);

        /* Le journal, lui, ne se répète pas : une ligne par bien et par
           demi-heure, comme pour l'ouverture de l'espace. */
        const ilYA30min = new Date(Date.now() - 30 * 60 * 1000).toISOString();
        const { data: dejaVu } = await supabase.from('espace_evenements')
          .select('id').eq('recherche_id', recherche.id).eq('bien_id', bien.id)
          .eq('type', 'fiche').gte('created_at', ilYA30min).limit(1).maybeSingle();
        if (!dejaVu) await evt('fiche', bien.titre || null, bien.id);
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
        /* Le client peut aussi VIDER un critère. On n'écrit donc une colonne que
           si son champ figure dans l'envoi — l'absence vaut « ne touche à rien »,
           null vaut « efface ». */
        const present = (k: string) => Object.prototype.hasOwnProperty.call(c, k);
        const parmi = (v: unknown, liste: string[]) => (typeof v === 'string' && liste.includes(v) ? v : null);
        /* Ces six-là passaient par une affectation directe : un champ absent de
           l'envoi valait null, donc « efface ». L'assistant étape par étape
           n'envoie que l'étape en cours — le budget minimum et le temps de
           transport du client se vidaient tout seuls. Ils passent par poser()
           comme les autres : absent = on ne touche à rien. */
        const maj: Record<string, unknown> = {};
        const poser = (colonne: string, champ: string, valeur: unknown) => {
          if (present(champ)) maj[colonne] = valeur;
        };
        poser('budget_min', 'budgetMin', n(c.budgetMin, 50_000, 20_000_000));
        poser('budget_max', 'budgetMax', n(c.budgetMax, 50_000, 20_000_000));
        poser('surface_min', 'surfaceMin', n(c.surfaceMin, 5, 2_000));
        poser('nb_pieces_min', 'piecesMin', n(c.piecesMin, 1, 20));
        poser('chambres_min', 'chambresMin', n(c.chambresMin, 0, 20));
        poser('transport_minutes', 'transportMinutes', n(c.transportMinutes, 1, 60));
        poser('surface_max', 'surfaceMax', n(c.surfaceMax, 5, 5_000));
        poser('surface_sejour_min', 'surfaceSejourMin', n(c.surfaceSejourMin, 5, 500));
        poser('nb_pieces_max', 'piecesMax', n(c.piecesMax, 1, 30));
        poser('annee_construction_min', 'anneeMin', n(c.anneeMin, 1700, 2100));
        poser('etage_min', 'etageMin', n(c.etageMin, 0, 60));
        poser('etage_max', 'etageMax', n(c.etageMax, 0, 60));
        poser('etage_max_sans_ascenseur', 'etageMaxSansAscenseur', n(c.etageMaxSansAscenseur, 0, 20));
        poser('exterieur_surface_min', 'exterieurSurfaceMin', n(c.exterieurSurfaceMin, 1, 5_000));
        poser('apport', 'apport', n(c.apport, 0, 20_000_000));
        poser('rdc_exclu', 'rdcExclu', !!c.rdcExclu);
        poser('dernier_etage', 'dernierEtage', !!c.dernierEtage);
        poser('etat_souhaite', 'etatSouhaite', parmi(c.etatSouhaite, ['a_renover', 'travaux_legers', 'bon_etat', 'refait_neuf']));
        poser('financement', 'financement', parmi(c.financement, ['cash', 'pret_valide', 'pret_en_cours', 'a_monter', 'pret_relais',
          'mixte_cash_pret', 'mixte_cash_relais', 'mixte_pret_relais']));
        poser('urgence', 'urgence', parmi(c.urgence, ['immediate', '3_mois', '6_mois', 'annee']));
        poser('cuisine_type', 'cuisineType', parmi(c.cuisineType, ['ouverte', 'separee']));
        poser('dpe_max', 'dpeMax', parmi(c.dpeMax, ['A', 'B', 'C', 'D', 'E', 'F', 'G']));

        if (Array.isArray(c.typesBien)) {
          const types = (c.typesBien as unknown[])
            .filter((x): x is string => typeof x === 'string' && x.trim().length > 0 && x.length <= 40)
            .map((x) => x.trim()).slice(0, 10);
          maj.type_bien = types.length ? types.join(', ') : null;
        }
        if (typeof c.exposition === 'string') {
          const connues = ['sud', 'est', 'ouest', 'nord', 'traversant'];
          const l = c.exposition.split(',').map((x: string) => x.trim()).filter((x: string) => connues.includes(x));
          maj.exposition_souhaitee = l.length ? l.join(', ') : null;
        }
        if (Array.isArray(c.transportArrets)) {
          maj.transport_arrets = (c.transportArrets as Record<string, unknown>[])
            .filter((a) => a && typeof a.nom === 'string' && a.nom.length <= 120)
            .slice(0, 8)
            .map((a) => ({
              nom: String(a.nom).trim(),
              ville: typeof a.ville === 'string' ? a.ville.slice(0, 80) : '',
              lignes: Array.isArray(a.lignes)
                ? (a.lignes as unknown[]).filter((x): x is string => typeof x === 'string').slice(0, 10) : [],
              minutes: Math.max(1, Math.min(60, Number(a.minutes) || 10)),
            }));
        }
        if (Array.isArray(c.transportLignes)) {
          maj.transport_lignes = (c.transportLignes as unknown[])
            .filter((x): x is string => typeof x === 'string' && x.trim().length > 0 && x.length <= 60)
            .map((x) => x.trim())
            .slice(0, 14);
        }
        if (Array.isArray(c.secteurs)) {
          maj.secteurs = c.secteurs.filter((s: unknown) => typeof s === 'string').slice(0, 20);
        }

        const CLES_EXIGENCES = ['parking', 'cave', 'balcon', 'terrasse', 'jardin', 'ascenseur',
          'gardien', 'interphone', 'digicode', 'exterieur', 'cuisine'];
        const BOOLEENS = ['parking', 'cave', 'balcon', 'terrasse', 'jardin', 'ascenseur', 'gardien'];
        if (c.exigences && typeof c.exigences === 'object' && !Array.isArray(c.exigences)) {
          /* Le client règle lui-même « souhaité » / « indispensable » : c'est lui qui fait foi,
             et les anciennes colonnes booléennes suivent. */
          const src = c.exigences as Record<string, unknown>;
          const ex: Record<string, string> = {};
          CLES_EXIGENCES.forEach((k) => {
            if (src[k] === 'souhaite' || src[k] === 'indispensable') ex[k] = src[k] as string;
          });
          maj.exigences = ex;
          BOOLEENS.forEach((k) => { maj[k] = !!ex[k]; });
        } else if (Array.isArray(c.equip)) {
          /* Ancien format, simples cases à cocher : on garde la nuance déjà posée par le chasseur. */
          const e = c.equip as string[];
          const ex = { ...((recherche.exigences || {}) as Record<string, string>) };
          ([['terrasse', 'Terrasse'], ['balcon', 'Balcon'], ['jardin', 'Jardin'], ['parking', 'Parking'],
            ['ascenseur', 'Ascenseur'], ['cave', 'Cave'], ['gardien', 'Gardien']] as [string, string][])
            .forEach(([cle, lib]) => {
              maj[cle] = e.includes(lib);
              if (e.includes(lib)) { if (!ex[cle]) ex[cle] = 'souhaite'; } else delete ex[cle];
            });
          maj.exigences = ex;
        }

        /* Ces quatre-là ont toujours une valeur dans l'écran client : un null
           signifie un envoi bancal, pas une volonté d'effacer. */
        (['surface_min', 'nb_pieces_min', 'chambres_min', 'budget_max'] as const)
          .forEach((k) => { if (maj[k] === null) delete maj[k]; });

        /* Rien de valide dans l'envoi : on ne va pas écrire un updated_at seul. */
        if (Object.keys(maj).length === 0) {
          return NextResponse.json({ ok: true, rien: true });
        }
        maj.updated_at = new Date().toISOString();

        await supabase.from('recherches').update(maj).eq('id', recherche.id);

        /* Ce résumé est ce qu'Alexandre lit dans « Historique client » : il doit
           dire en une ligne ce que le client a touché, pas seulement le budget. */
        const eur = (v: unknown) => Number(v).toLocaleString('fr-FR') + ' €';
        const resume = [
          maj.type_bien ? `type : ${maj.type_bien}` : null,
          maj.budget_min && maj.budget_max ? `budget ${eur(maj.budget_min)} – ${eur(maj.budget_max)}`
            : maj.budget_max ? `budget jusqu'à ${eur(maj.budget_max)}` : null,
          maj.surface_min ? `${maj.surface_min} m² min` : null,
          maj.surface_max ? `${maj.surface_max} m² max` : null,
          maj.nb_pieces_min ? `${maj.nb_pieces_min} pièces min` : null,
          maj.chambres_min != null ? `${maj.chambres_min} chambres min` : null,
          maj.etage_min || maj.etage_max || maj.etage_max_sans_ascenseur ? 'étage' : null,
          maj.exposition_souhaitee ? `exposition ${maj.exposition_souhaitee}` : null,
          'exigences' in maj ? 'équipements' : null,
          maj.cuisine_type ? `cuisine ${maj.cuisine_type}` : null,
          maj.dpe_max ? `DPE ${maj.dpe_max} max` : null,
          Array.isArray(maj.secteurs) ? `${(maj.secteurs as string[]).length} secteurs` : null,
          Array.isArray(maj.transport_arrets)
            ? ((maj.transport_arrets as { nom: string; minutes: number }[]).length
              ? 'transports : ' + (maj.transport_arrets as { nom: string; minutes: number }[]).map(a => `${a.nom} (${a.minutes} min)`).join(', ')
              : 'plus de contrainte de transport') : null,
          maj.apport ? `apport ${eur(maj.apport)}` : null,
          maj.financement ? `financement ${maj.financement}` : null,
          maj.urgence ? `échéance ${maj.urgence}` : null,
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
        /* Colonnes réelles de la table : date_echeance / note / statut « en_attente ».
           C'est ce que lisent le tableau de bord et la page Relances. */
        const demain = new Date(); demain.setDate(demain.getDate() + 1);
        await supabase.from('relances').insert({
          client_id: recherche.client_id, recherche_id: recherche.id,
          type: 'message_client', statut: 'en_attente',
          date_echeance: demain.toISOString(),
          note: 'Message depuis l’espace : ' + texte.slice(0, 180),
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
