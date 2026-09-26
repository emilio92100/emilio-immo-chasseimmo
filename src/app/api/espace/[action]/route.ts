import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { lienBienPublic } from '@/lib/jeton';
import { etatServeur, alerteHorsMandat } from '@/lib/mandat-serveur';

/**
 * Tout ce que l'espace acheteur écrit passe par ici.
 *
 *   POST /api/espace/vue       { token, bien_id }
 *   POST /api/espace/retour    { token, bien_id, avis, commentaire }
 *   POST /api/espace/criteres  { token, criteres }
 *   POST /api/espace/message   { token, texte }
 *   POST /api/espace/rappel    { token, creneau }
 *   POST /api/espace/partage   { token, bien_id, destinataire }
 *   POST /api/espace/toujours  { token }   « je cherche toujours » (point automatique)
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

/* Le mail qui prévient Alexandre qu'un client veut visiter un bien. Court :
   qui, quel bien, ses disponibilités, et le bouton vers sa fiche dans le CRM. */
async function prevenirVisite(
  supabase: ReturnType<typeof base>, clientId: string,
  bien: { id: string; titre?: string | null; ville?: string | null; quartier?: string | null; photos?: string[] | null; prix_acquereur?: number | null; prix_vendeur?: number | null },
  dispos: string,
  sansMandat = false,
) {
  const apiKey = process.env.MAILJET_API_KEY, apiSecret = process.env.MAILJET_API_SECRET;
  if (!apiKey || !apiSecret) return;
  const { data: client } = await supabase.from('clients').select('id, prenom, nom').eq('id', clientId).maybeSingle();
  const nom = client ? `${client.prenom || ''} ${client.nom || ''}`.trim() : 'Un client';
  const echappe = (t: string) => String(t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const crm = process.env.NEXT_PUBLIC_CRM_URL || 'https://crm.emilio-immo.com';
  const lien = `${crm}/?page=fiche&client=${encodeURIComponent(clientId)}`;
  const titre = bien.titre || 'un bien';
  const lieu = [bien.quartier, bien.ville].filter(Boolean).join(', ');
  const prix = bien.prix_acquereur || bien.prix_vendeur;
  const photo = Array.isArray(bien.photos) ? bien.photos.filter(Boolean)[0] : null;
  const html = `<div style="font-family:'DM Sans',Helvetica,Arial,sans-serif;max-width:560px;margin:0 auto;color:#2f3c52">
  <div style="background:#1a2332;padding:18px 22px;border-radius:14px 14px 0 0">
    <div style="color:#c9a84c;font-weight:700;letter-spacing:2px;font-size:11px">EMILIO · CRM</div>
    <div style="color:#ffffff;font-weight:800;font-size:18px;margin-top:6px">${echappe(nom)} veut visiter</div>
  </div>
  <div style="border:1px solid #e3e8f0;border-top:none;border-radius:0 0 14px 14px;padding:20px 22px">
    <div style="border:1px solid #e3e8f0;border-radius:12px;overflow:hidden;background:#f8fafc">
      ${photo ? `<img src="${echappe(photo)}" alt="" width="514" style="width:100%;max-width:514px;height:auto;display:block;border:0" />` : ''}
      <div style="padding:14px 16px">
        <div style="font-weight:700;font-size:15px;color:#1a2332">${echappe(titre)}</div>
        ${lieu ? `<div style="color:#64748b;margin-top:4px;font-size:13px">${echappe(lieu)}</div>` : ''}
        ${prix ? `<div style="font-weight:800;font-size:17px;color:#1a2332;margin-top:8px">${Number(prix).toLocaleString('fr-FR')} €</div>` : ''}
      </div>
    </div>
    <div style="margin-top:16px;font-size:12px;letter-spacing:1px;text-transform:uppercase;color:#94a3b8;font-weight:700">Ses disponibilités</div>
    <div style="margin-top:6px;font-size:14px;line-height:1.6;color:#1a2332">${dispos ? echappe(dispos) : 'Pas précisées : à lui demander.'}</div>
    ${sansMandat ? `<div style="margin-top:16px;padding:12px 14px;border-radius:10px;background:#fff7ed;border:1px solid #fed7aa;color:#9a3412;font-size:13px;line-height:1.55"><b>Pas de mandat signé.</b> Il n'a pas pu signer depuis son espace : aucun numéro n'était prêt pour lui. Ajoute des numéros d'avance dans le CRM (bloc Mandat), ou fais-lui signer le sien avant de caler la visite.</div>` : ''}
    <a href="${lien}" style="display:inline-block;margin-top:18px;background:#c9a84c;color:#1a2332;text-decoration:none;padding:12px 18px;border-radius:10px;font-weight:800">Ouvrir sa fiche</a>
    <div style="margin-top:14px;font-size:12px;color:#94a3b8">La demande est aussi dans tes Relances, pour aujourd’hui.</div>
  </div>
</div>`;
  const auth = Buffer.from(`${apiKey}:${apiSecret}`).toString('base64');
  await fetch('https://api.mailjet.com/v3.1/send', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Basic ${auth}` },
    body: JSON.stringify({
      Messages: [{
        From: { Email: FROM_EMAIL, Name: 'Emilio · CRM' },
        To: [{ Email: process.env.ALERTES_EMAIL || FROM_EMAIL }],
        Subject: `👀 ${nom} veut visiter · ${titre}`,
        TextPart: `${nom} veut visiter : ${titre}${lieu ? ` (${lieu})` : ''}${prix ? ` — ${Number(prix).toLocaleString('fr-FR')} €` : ''}.\n\nSes disponibilités : ${dispos || 'pas précisées, à lui demander.'}${sansMandat ? "\n\n⚠️ Pas de mandat signé : aucun numéro n'était prêt pour lui. Ajoute des numéros d'avance dans le CRM, ou fais-lui signer le sien avant la visite." : ''}\n\nOuvrir sa fiche : ${lien}\n\nLa demande est aussi dans tes Relances, pour aujourd’hui.`,
        HTMLPart: html,
        CustomID: `visite-${bien.id}-${Date.now()}`,
        TrackOpens: 'disabled', TrackClicks: 'disabled',
      }],
    }),
  });
}

/* ── Ce que le client a changé dans ses critères, avant → après ─────────
   Alexandre ne veut pas relire tout le dossier à chaque modification : il
   veut savoir ce qui a bougé. On compare donc la recherche AVANT l'écriture
   avec ce qui va être écrit, colonne par colonne, et on ne garde que les
   différences, en français. Le résultat part dans le journal (metadata
   « changements », lu par la fenêtre « Historique client ») et, en une
   ligne, dans la description et dans espace_evenements.detail. */

type Changement =
  | { l: string; a: string | null; p: string | null }   // une valeur : avant → après (null = rien)
  | { l: string; plus: string[]; moins: string[] };      // une liste : ajoutés / retirés

const EUR_T = (v: number) => v.toLocaleString('fr-FR').replace(/\u202f/g, '\u00a0') + '\u00a0€';
const ETIQ_ETATS: Record<string, string> = {
  a_renover: 'à rénover', travaux_legers: 'travaux légers', bon_etat: 'bon état', refait_neuf: 'refait à neuf',
};
const ETIQ_FINANCEMENT: Record<string, string> = {
  cash: 'cash', pret_valide: 'prêt validé', pret_en_cours: 'prêt en cours', a_monter: 'prêt à monter',
  pret_relais: 'prêt relais', mixte_cash_pret: 'cash + prêt', mixte_cash_relais: 'cash + prêt relais',
  mixte_pret_relais: 'prêt + prêt relais',
};
const ETIQ_URGENCE: Record<string, string> = {
  immediate: 'immédiate', '3_mois': 'sous 3 mois', '6_mois': 'sous 6 mois', annee: 'dans l’année',
};
const ETIQ_EXIGENCE: Record<string, string> = {
  parking: 'Parking', cave: 'Cave', balcon: 'Balcon', terrasse: 'Terrasse', jardin: 'Jardin',
  ascenseur: 'Ascenseur', gardien: 'Gardien', interphone: 'Interphone', digicode: 'Digicode',
  exterieur: 'Extérieur', cuisine: 'Cuisine',
};
const etage = (v: number) => (v === 0 ? 'rez-de-chaussée' : v === 1 ? '1er étage' : `${v}e étage`);

/* Les valeurs simples : [colonne, libellé, mise en forme]. */
const VALEURS: [string, string, (v: any) => string][] = [
  ['budget_min', 'Budget minimum', (v) => EUR_T(Number(v))],
  ['budget_max', 'Budget maximum', (v) => EUR_T(Number(v))],
  ['apport', 'Apport', (v) => EUR_T(Number(v))],
  ['surface_min', 'Surface minimum', (v) => `${v}\u00a0m²`],
  ['surface_max', 'Surface maximum', (v) => `${v}\u00a0m²`],
  ['surface_sejour_min', 'Séjour minimum', (v) => `${v}\u00a0m²`],
  ['exterieur_surface_min', 'Extérieur minimum', (v) => `${v}\u00a0m²`],
  ['nb_pieces_min', 'Pièces minimum', (v) => `${v} pièce${Number(v) > 1 ? 's' : ''}`],
  ['nb_pieces_max', 'Pièces maximum', (v) => `${v} pièce${Number(v) > 1 ? 's' : ''}`],
  ['chambres_min', 'Chambres minimum', (v) => (Number(v) === 0 ? 'aucune exigence' : `${v} chambre${Number(v) > 1 ? 's' : ''}`)],
  ['etage_min', 'Étage minimum', (v) => etage(Number(v))],
  ['etage_max', 'Étage maximum', (v) => etage(Number(v))],
  ['etage_max_sans_ascenseur', 'Sans ascenseur, pas au-dessus du', (v) => etage(Number(v))],
  ['annee_construction_min', 'Construit après', (v) => String(v)],
  ['transport_minutes', 'Temps de trajet maximum', (v) => `${v}\u00a0min`],
  ['rdc_exclu', 'Rez-de-chaussée', (v) => (v ? 'exclu' : 'accepté')],
  ['dernier_etage', 'Dernier étage', (v) => (v ? 'souhaité' : 'indifférent')],
  ['financement', 'Financement', (v) => ETIQ_FINANCEMENT[v] || String(v)],
  ['urgence', 'Échéance', (v) => ETIQ_URGENCE[v] || String(v)],
  ['cuisine_type', 'Cuisine', (v) => (v === 'ouverte' ? 'ouverte sur le séjour' : v === 'separee' ? 'séparée' : String(v))],
  ['dpe_max', 'DPE maximum', (v) => String(v)],
];
/* Les oui/non : faux et vide disent la même chose. */
const OUI_SEUL = new Set(['rdc_exclu', 'dernier_etage']);
/* Jusqu'au 24 septembre, un champ laissé vide s'enregistrait 0 (voir n()
   plus bas). Ces zéros-là ne viennent pas du client : quand ils repartent,
   ce n'est pas lui qui a « retiré » quelque chose, et on ne l'écrit pas.
   Pour l'apport et l'étage minimum, 0 et vide veulent dire la même chose. */
const ZERO_COMME_VIDE = new Set(['apport', 'etage_min']);
const ZERO_HERITE = new Set(['etage_max', 'etage_max_sans_ascenseur']);

const vide = (v: unknown) => v === null || v === undefined || v === '' || (Array.isArray(v) && v.length === 0);
const liste = (v: unknown): string[] => (Array.isArray(v) ? v.map(String)
  : typeof v === 'string' ? v.split(',').map((x) => x.trim()).filter(Boolean) : []);

function comparerListe(l: string, avant: string[], apres: string[], out: Changement[]) {
  const plus = apres.filter((x) => !avant.includes(x));
  const moins = avant.filter((x) => !apres.includes(x));
  if (plus.length || moins.length) out.push({ l, plus, moins });
}

function decrireChangements(avant: Record<string, any>, maj: Record<string, unknown>): Changement[] {
  const out: Changement[] = [];
  const dans = (k: string) => Object.prototype.hasOwnProperty.call(maj, k);

  if (dans('type_bien')) comparerListe('Type de bien', liste(avant.type_bien), liste(maj.type_bien), out);

  for (const [k, l, f] of VALEURS) {
    if (!dans(k)) continue;
    let a: any = avant[k], p: any = maj[k];
    /* Un oui/non se lit « exclu → accepté », jamais « retiré ». */
    if (OUI_SEUL.has(k)) {
      if (!!a !== !!p) out.push({ l, a: f(!!a), p: f(!!p) });
      continue;
    }
    if (ZERO_COMME_VIDE.has(k)) { if (Number(a) === 0) a = null; if (Number(p) === 0) p = null; }
    if (ZERO_HERITE.has(k) && Number(a) === 0 && a !== null && vide(p)) continue;
    if (vide(a) && vide(p)) continue;
    if (!vide(a) && !vide(p) && String(a) === String(p)) continue;
    out.push({ l, a: vide(a) ? null : f(a), p: vide(p) ? null : f(p) });
  }

  if (dans('etat_souhaite')) {
    const e = (v: unknown) => liste(v).map((x) => ETIQ_ETATS[x] || x);
    comparerListe('État du bien', e(avant.etat_souhaite), e(maj.etat_souhaite), out);
  }
  if (dans('exposition_souhaitee')) comparerListe('Exposition', liste(avant.exposition_souhaitee), liste(maj.exposition_souhaitee), out);
  if (dans('secteurs')) comparerListe('Secteurs', liste(avant.secteurs), liste(maj.secteurs), out);
  if (dans('transport_lignes')) comparerListe('Lignes de transport', liste(avant.transport_lignes), liste(maj.transport_lignes), out);

  if (dans('transport_arrets')) {
    type Arret = { nom: string; minutes?: number };
    const av = (Array.isArray(avant.transport_arrets) ? avant.transport_arrets : []) as Arret[];
    const ap = (Array.isArray(maj.transport_arrets) ? maj.transport_arrets : []) as Arret[];
    const plus: string[] = [], moins: string[] = [];
    ap.forEach((x) => {
      const y = av.find((z) => z.nom === x.nom);
      if (!y) plus.push(`${x.nom} (${x.minutes} min)`);
      else if (Number(y.minutes) !== Number(x.minutes)) {
        out.push({ l: `Trajet jusqu’à ${x.nom}`, a: `${y.minutes}\u00a0min`, p: `${x.minutes}\u00a0min` });
      }
    });
    av.forEach((y) => { if (!ap.some((x) => x.nom === y.nom)) moins.push(`${y.nom} (${y.minutes} min)`); });
    if (plus.length || moins.length) out.push({ l: 'Arrêts de transport', plus, moins });
  }

  /* Équipements : « souhaité » / « indispensable » / rien, un par un. */
  if (dans('exigences')) {
    const ea = (avant.exigences && typeof avant.exigences === 'object' ? avant.exigences : {}) as Record<string, string>;
    const ep = (maj.exigences && typeof maj.exigences === 'object' ? maj.exigences : {}) as Record<string, string>;
    const mot = (v?: string) => (v === 'indispensable' ? 'indispensable' : v === 'souhaite' ? 'souhaité' : null);
    Object.keys(ETIQ_EXIGENCE).forEach((k) => {
      const a = mot(ea[k]), p = mot(ep[k]);
      if (a !== p) out.push({ l: ETIQ_EXIGENCE[k], a, p });
    });
  }
  return out;
}

/* La même chose en une ligne, pour les endroits qui n'affichent que du texte. */
function ligneChangements(ch: Changement[]): string {
  return ch.map((c) => {
    if ('plus' in c) {
      return `${c.l} : ${[...c.plus.map((x) => '+ ' + x), ...c.moins.map((x) => '− ' + x)].join(', ')}`;
    }
    if (c.a === null) return `${c.l} : ajouté${c.p ? ` (${c.p})` : ''}`;
    if (c.p === null) return `${c.l} : retiré (était ${c.a})`;
    return `${c.l} : ${c.a} → ${c.p}`;
  }).join(' · ');
}

export async function POST(req: NextRequest, ctx: { params: Promise<{ action: string }> }) {
  try {
    const { action } = await ctx.params;
    const body = await req.json();
    const token = typeof body?.token === 'string' ? body.token : '';
    /* Deux générations de liens cohabitent : les anciens font 64 caractères,
       les nouveaux « dupont-k3n8vq2fab » une vingtaine (voir src/lib/jeton.ts).
       Le plancher doit donc être le même qu'à l'affichage de l'espace, sinon
       un nouveau client ne pourrait plus rien enregistrer. */
    if (!token || token.length < 12 || token.length > 128) {
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
        .select('id, titre, surface, nb_pieces, nb_chambres, ville, quartier, photos, prix_acquereur, prix_vendeur, nb_vues, vu_le, recherche_id')
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

        /* ── Pas de visite sans mandat ──
           S'il veut visiter et qu'un mandat peut lui être proposé (un numéro
           préparé, ou la réserve d'Alexandre), il doit d'abord le signer :
           l'espace ouvre alors le parcours de signature (voir
           /api/espace/mandat) et renvoie sa demande juste après. Sans aucun
           numéro disponible, la demande passe, et Alexandre est alerté.
           La recherche est relue en entier : ses colonnes « mandat_ »
           n'existent qu'une fois le SQL passé, et un select('*') ne casse
           jamais sur une colonne absente. */
        let sansMandat = false;
        if (avis === 'souhaite_visiter') {
          const { data: rm } = await supabase.from('recherches').select('*').eq('id', recherche.id).maybeSingle();
          const etat = rm ? await etatServeur(supabase, rm) : 'sans_numero';
          if (etat === 'a_signer') return NextResponse.json({ ok: false, error: 'mandat' }, { status: 409 });
          sansMandat = etat === 'sans_numero';
        }

        const libelle = avis === 'interesse' ? '👍 Ça lui plaît'
          : avis === 'souhaite_visiter' ? '👀 Il veut visiter' : '👎 Pas pour lui';

        /* Ce qu'il avait déjà dit. Après un « ça me plaît », il peut encore
           demander à visiter : on garde son premier mot s'il n'en ajoute pas,
           et on ne prévient Alexandre qu'une fois par bien. */
        const { data: avant } = await supabase.from('biens')
          .select('badge_retour, retour_client').eq('id', bien.id).maybeSingle();
        const dejaVisite = avant?.badge_retour === 'souhaite_visiter';
        const garde = avis === 'souhaite_visiter' && avant?.badge_retour === 'interesse' ? (avant?.retour_client || null) : null;

        await supabase.from('biens').update({
          badge_retour: avis, retour_client: com || garde || null,
          retour_le: new Date().toISOString(), retour_par: 'client',
        }).eq('id', bien.id);

        await supabase.from('journal').insert({
          client_id: recherche.client_id, bien_id: bien.id, recherche_id: recherche.id,
          type: 'retour_client', titre: `${libelle} — depuis son espace`,
          description: com || null, metadata: {},
        });
        /* Le client vient de répondre : la relance automatique posée à
           l'envoi n'a plus d'objet. On ne touche pas aux relances manuelles,
           celles-là sont posées par Alexandre et lui seul les clôture. */
        await supabase.from('relances')
          .update({ statut: 'cloturee' })
          .eq('client_id', recherche.client_id)
          .eq('recherche_id', recherche.id)
          .eq('type', 'auto')
          .eq('statut', 'en_attente');

        /* Il veut visiter : Alexandre doit le savoir tout de suite. Une
           relance du jour (elle sort en rouge dans Relances et sur le tableau
           de bord ; « Veut visiter » ouvre la fiche sur Présentés), et un mail
           pour l'avoir même loin du CRM. Un échec du mail ne bloque rien. */
        if (avis === 'souhaite_visiter' && !dejaVisite) {
          await supabase.from('relances').insert({
            client_id: recherche.client_id, recherche_id: recherche.id,
            type: 'rappel_client', statut: 'en_attente',
            date_echeance: new Date().toISOString(),
            note: `Veut visiter — ${bien.titre || 'un bien'}${com ? ` · ${com}` : ''}${sansMandat ? ' · ⚠️ mandat non signé' : ''}`.slice(0, 600),
          });
          try { await prevenirVisite(supabase, recherche.client_id, bien, com, sansMandat); } catch { /* le CRM le montre déjà */ }
        }

        await evt('avis', `${libelle}${com ? ' · ' + com : ''}`, bien.id);
        return NextResponse.json({ ok: true });
      }

      /* ── il fait évoluer ses critères ───────────────────────── */
      case 'criteres': {
        const c = body.criteres || {};
        const n = (v: unknown, min: number, max: number) => {
          /* Un champ vide n'est pas un zéro. Number(null) vaut 0 : un « étage
             maximum » laissé vide s'enregistrait « rez-de-chaussée », et un
             apport vide « 0 € ». Vide = null, point. */
          if (v === null || v === undefined || (typeof v === 'string' && v.trim() === '')) return null;
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
        /* Plusieurs états possibles (« travaux_legers,bon_etat »), rien = pas de préférence. */
        const etats = (v: unknown) => {
          if (typeof v !== 'string') return null;
          const l = v.split(',').map(x => x.trim());
          const ok = ['a_renover', 'travaux_legers', 'bon_etat', 'refait_neuf'].filter(k => l.includes(k));
          return ok.length ? ok.join(',') : null;
        };
        poser('etat_souhaite', 'etatSouhaite', etats(c.etatSouhaite));
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
        /* Ce qu'il y avait avant, pour dire exactement ce qui a changé. Les
           colonnes lues sont celles qu'on s'apprête à écrire : elles existent
           forcément. Si la lecture échoue, on retombe sur l'ancien résumé. */
        const colonnes = Object.keys(maj);
        const { data: avant, error: errAvant } = await supabase.from('recherches')
          .select(colonnes.join(', ')).eq('id', recherche.id).maybeSingle();
        const changements = !errAvant && avant
          ? decrireChangements(avant as unknown as Record<string, unknown>, maj) : null;

        /* Ce que borne un mandat signé : budget (prix maximum), secteurs, type
           de bien. On garde la version d'avant pour ne prévenir Alexandre que
           d'un écart nouveau (voir alerteHorsMandat). */
        const { data: avantMandat } = ['budget_max', 'secteurs', 'type_bien'].some(k => k in maj)
          ? await supabase.from('recherches').select('type_bien, secteurs, budget_max, nb_pieces_min, chambres_min, surface_min')
            .eq('id', recherche.id).maybeSingle()
          : { data: null };

        maj.updated_at = new Date().toISOString();

        const { error: errMaj } = await supabase.from('recherches').update(maj).eq('id', recherche.id);
        if (errMaj) {
          return NextResponse.json({ ok: false, error: 'enregistrement impossible' }, { status: 500 });
        }
        if (avantMandat) {
          const avantM = avantMandat as unknown as Record<string, unknown>;
          await alerteHorsMandat(supabase, { rechercheId: recherche.id, clientId: recherche.client_id, avant: avantM, apres: { ...avantM, ...maj } })
            .catch(e => console.error('[espace/criteres] alerte mandat', e));
        }

        /* Il a validé sans rien changer : rien à raconter à Alexandre. */
        if (changements && changements.length === 0) {
          return NextResponse.json({ ok: true, rien: true });
        }
        if (changements) {
          const ligne = ligneChangements(changements).slice(0, 1500);
          await supabase.from('journal').insert({
            client_id: recherche.client_id, recherche_id: recherche.id,
            type: 'criteres_modifies', titre: 'Critères modifiés par le client, depuis son espace',
            description: ligne || null, metadata: { changements },
          });
          await evt('criteres', ligne || null);
          return NextResponse.json({ ok: true });
        }

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

      /* ── il demande à être rappelé ──────────────────────────── */
      case 'rappel': {
        const CRENEAUX: Record<string, string> = {
          matin: 'le matin (8h – 12h)',
          apres_midi: 'l’après-midi (12h – 18h)',
          soir: 'en fin de journée (18h – 20h)',
        };
        const creneau = typeof body.creneau === 'string' ? body.creneau : '';
        const quand = CRENEAUX[creneau];
        if (!quand) return NextResponse.json({ ok: false, error: 'créneau inconnu' }, { status: 400 });

        /* Garde-fou : une demande par jour et par lien suffit. Un client qui
           reclique n'en fait pas une deuxième, il croit que la première n'est
           pas partie — c'est ce que lui dit l'écran de retour. */
        const depuis24h = new Date(Date.now() - 86_400_000).toISOString();
        const { count } = await supabase.from('journal')
          .select('id', { count: 'exact', head: true })
          .eq('recherche_id', recherche.id).eq('type', 'demande_rappel')
          .gte('created_at', depuis24h);
        if ((count || 0) >= 1) {
          return NextResponse.json({ ok: false, error: 'demande déjà enregistrée' }, { status: 429 });
        }

        await supabase.from('journal').insert({
          client_id: recherche.client_id, recherche_id: recherche.id,
          type: 'demande_rappel', titre: '📞 Demande de rappel, depuis son espace',
          description: `Souhaite être rappelé ${quand}.`, metadata: { creneau },
        });

        /* Une demande de rappel n'attend pas demain : l'échéance est du jour,
           donc elle sort tout de suite sur le tableau de bord et dans Relances.
           Colonnes réelles : date_echeance / note / statut « en_attente ». */
        await supabase.from('relances').insert({
          client_id: recherche.client_id, recherche_id: recherche.id,
          type: 'rappel_client', statut: 'en_attente',
          date_echeance: new Date().toISOString(),
          note: `Demande de rappel depuis l’espace — ${quand}.`,
        });

        /* Le type reste « message » côté espace_evenements : cette table a une
           liste de types fermée, et un rappel est bien un message du client. */
        await evt('message', `Demande de rappel — ${quand}`);
        return NextResponse.json({ ok: true });
      }

      /* ── « Je cherche toujours », en réponse au point automatique ──
         Une réaction du client comme une autre : elle remet à zéro le
         compteur du point automatique (src/lib/point-auto.ts). Pas de
         relance : il n'y a rien à rappeler, la recherche continue. */
      case 'toujours': {
        const depuis24h = new Date(Date.now() - 86_400_000).toISOString();
        const { count } = await supabase.from('journal')
          .select('id', { count: 'exact', head: true })
          .eq('client_id', recherche.client_id).eq('type', 'point_auto_reponse')
          .gte('created_at', depuis24h);
        if ((count || 0) >= 1) return NextResponse.json({ ok: true, deja: true });

        const { error } = await supabase.from('journal').insert({
          client_id: recherche.client_id, recherche_id: recherche.id,
          type: 'point_auto_reponse',
          titre: '✅ Le client cherche toujours, depuis son espace',
          description: 'Réponse au mail « Où en est votre recherche ? ».',
          metadata: { reponse: 'toujours' },
        });
        if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
        await evt('message', 'Je cherche toujours — réponse au mail « Où en est votre recherche ? »');
        return NextResponse.json({ ok: true });
      }

      /* ── il dit que sa recherche est terminée ───────────────── */
      case 'fin': {
        const MOTIFS: Record<string, string> = {
          trouve_avec_vous: 'a trouvé son bien avec nous',
          trouve_ailleurs: 'a trouvé son bien par un autre biais',
          pause: 'souhaite mettre sa recherche en pause',
          /* Distinct de la pause, et la nuance compte : une pause se relance,
             un arrêt se clôture. Le rappel ne se prépare pas pareil. */
          abandon: 'arrête sa recherche',
        };
        const motif = typeof body.motif === 'string' ? body.motif : '';
        const quoi = MOTIFS[motif];
        if (!quoi) return NextResponse.json({ ok: false, error: 'motif inconnu' }, { status: 400 });
        const mot = nettoie(body.mot, 400);

        /* Une déclaration par jour suffit : s'il reclique, c'est qu'il doute
           que la première soit partie — l'écran le lui dit, on n'en crée pas
           une deuxième. */
        const depuis24h = new Date(Date.now() - 86_400_000).toISOString();
        const { count } = await supabase.from('journal')
          .select('id', { count: 'exact', head: true })
          .eq('recherche_id', recherche.id).eq('type', 'fin_recherche')
          .gte('created_at', depuis24h);
        if ((count || 0) >= 1) {
          return NextResponse.json({ ok: false, error: 'déjà signalé' }, { status: 429 });
        }

        /* On ne clôture rien ici. Un dossier se ferme après un appel, pas sur
           un clic : c'est au chasseur de confirmer depuis sa fiche. */
        await supabase.from('journal').insert({
          client_id: recherche.client_id, recherche_id: recherche.id,
          type: 'fin_recherche',
          titre: `🏁 Le client ${quoi}, depuis son espace`,
          description: mot || null, metadata: { motif },
        });

        /* Il a trouvé et il est propriétaire avec une revente possible : c'est
           le moment de lui parler de son logement actuel. La relance le dit. */
        let revente = false;
        if (motif === 'trouve_avec_vous' || motif === 'trouve_ailleurs') {
          const { data: cl } = await supabase.from('clients')
            .select('bien_actuel_a_vendre').eq('id', recherche.client_id).maybeSingle();
          revente = !!cl?.bien_actuel_a_vendre;
        }

        await supabase.from('relances').insert({
          client_id: recherche.client_id, recherche_id: recherche.id,
          type: 'rappel_client', statut: 'en_attente',
          date_echeance: new Date().toISOString(),
          note: `Le client ${quoi} — à rappeler avant de clôturer.${revente ? ' 🔑 Revente possible : c\u2019est le moment de lui parler de son logement actuel.' : ''}`,
        });

        /* Liste de types fermée côté espace_evenements : c'est un message. */
        await evt('message', `Fin de recherche — ${quoi}${mot ? ` : ${mot}` : ''}`);
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
        /* Le domaine d'Emilio, pas celui de Vercel : ce lien part chez un
           proche du client, il doit avoir l'air de ce qu'il est. */
        const lien = lienBienPublic(bien.id as string);
        const prix = bien.prix_acquereur || bien.prix_vendeur;
        const carac = [bien.surface ? bien.surface + ' m²' : null,
          bien.nb_pieces ? bien.nb_pieces + ' pièce' + (bien.nb_pieces > 1 ? 's' : '') : null,
          bien.nb_chambres ? bien.nb_chambres + ' chambre' + (bien.nb_chambres > 1 ? 's' : '') : null,
        ].filter(Boolean).join(' · ');
        const lieuBien = [bien.quartier, bien.ville].filter(Boolean).join(', ');
        /* Un bien se partage avec une photo, sinon ce n'est qu'un lien de plus
           dans une boîte de réception. On prend la première, en pleine largeur. */
        const photo = Array.isArray(bien.photos) ? bien.photos.filter(Boolean)[0] : null;
        const echappe = (t: string) => String(t)
          .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

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
    <p style="margin:0 0 20px;line-height:1.7">Voici un bien que je suis en train de regarder.
      Dites-moi ce que vous en pensez.</p>
    <div style="border:1px solid #e3e8f0;border-radius:12px;background:#f8fafc;overflow:hidden">
      ${photo ? `<img src="${echappe(photo)}" alt="" width="510" style="width:100%;max-width:510px;height:auto;display:block;border:0" />` : ''}
      <div style="padding:16px">
      <div style="font-weight:700;font-size:16px;color:#1a2332">${bien.titre || 'Le bien'}</div>
      ${lieuBien ? `<div style="color:#64748b;margin-top:5px;font-size:13px"><span style="color:#c9a84c">&#9679;</span> ${echappe(lieuBien)}</div>` : ''}
      ${carac ? `<div style="color:#64748b;margin-top:6px;font-size:13px">${carac}</div>` : ''}
      ${prix ? `<div style="font-weight:800;font-size:20px;color:#1a2332;margin-top:10px">${Number(prix).toLocaleString('fr-FR')} €</div>` : ''}
      <a href="${lien}" style="display:inline-block;margin-top:14px;background:#c9a84c;color:#fff;
        text-decoration:none;padding:11px 18px;border-radius:10px;font-weight:700">Voir la fiche</a>
      </div>
    </div>
    <p style="margin:20px 0 0">${prenom}</p>
    <hr style="border:none;border-top:1px solid #e3e8f0;margin:24px 0 14px">
    <div style="font-size:12px;color:#94a3b8;line-height:1.6">
      Fiche transmise par ${prenom}.<br>
      Ce bien est présenté par Alexandre Rogelet, chasseur immobilier · 06 58 95 76 32<br>
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
              TextPart: `Bonjour,\n\nVoici un bien que je suis en train de regarder. Dites-moi ce que vous en pensez.\n\n${bien.titre || ''}\n${[carac, prix ? Number(prix).toLocaleString('fr-FR') + ' \u20ac' : null].filter(Boolean).join(' \u00b7 ')}\n${lien}\n\n${prenom}\n\n---\nFiche transmise par ${prenom}.\nCe bien est présenté par Alexandre Rogelet, chasseur immobilier · 06 58 95 76 32\nEmilio Immobilier — RT Conseils · CPI 9201 2020 000 045 344`,
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
