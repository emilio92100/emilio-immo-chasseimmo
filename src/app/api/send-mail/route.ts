import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { lienEspace } from '@/lib/jeton';
import { nommerRecherche } from '@/lib/espace';

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

/* Le bouton de chaque bien mène à l'espace acheteur, ouvert sur ce bien-là :
   c'est la seule page où le client peut répondre « ça me plaît », demander une
   visite ou dire non. La fiche publique /bien/<id> reste, mais elle est en
   lecture seule : elle sert au partage à un tiers, pas au client lui-même.

   lienEspace() choisit tout seul la bonne adresse : la courte pour les
   nouveaux jetons, l'ancienne pour les liens déjà envoyés (voir
   src/lib/jeton.ts). Un client ne verra donc jamais son lien changer. */
function lienBien(b: BienLite, token?: string | null, recherche?: string | null): string {
  if (!token) return `${SITE_URL}/bien/${b.id}`;
  /* `r` dit sur quelle recherche ouvrir l'espace. Sans lui, un client qui en
     a deux pourrait arriver sur l'autre, et la fiche ne s'ouvrirait pas :
     elle n'y existe pas (voir src/lib/espace.ts). */
  const r = recherche ? `r=${encodeURIComponent(recherche)}&` : '';
  return `${lienEspace(token, SITE_URL)}?${r}bien=${b.id}`;
}

/* « Je ne suis plus en recherche ».
   Le lien n'annule rien en arrivant : il ouvre l'espace sur la question, et
   c'est le client qui choisit sa réponse. C'est volontaire — les messageries
   et les antivirus ouvrent les liens des mails pour les vérifier, et un lien
   qui agirait au simple clic clôturerait des dossiers tout seul. */
function lienFin(token?: string | null): string {
  return token ? `${lienEspace(token, SITE_URL)}?fin=1` : '';
}

function buildHtml(opts: { prenom: string; corps: string; biens: BienLite[]; token?: string | null; recherche?: string | null }): string {
  const { corps, biens } = opts;
  const corpsHtml = escapeHtml(corps).replace(/\n/g, '<br/>');
  const token = opts.token;
  const rech = opts.recherche || null;
  const single = biens.length === 1;

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

  // Séparateur doux (petite barre dorée centrée) pour lier les sections
  const softDivider = `<tr><td align="center" style="padding:18px 28px 0;"><div style="width:46px;height:2px;background:${DORE};opacity:0.55;line-height:2px;font-size:0;">&nbsp;</div></td></tr>`;
  const hairline = `<tr><td style="padding:0 28px;"><div style="border-top:1px solid #eee5d6;line-height:0;font-size:0;">&nbsp;</div></td></tr>`;

  function singleBloc(b: BienLite): string {
    const photo = photoOf(b);
    const prix = prixOf(b);
    const loc = locOf(b);
    const etageTxt = etageOf(b);
    const cells: { v: string; l: string }[] = [];
    if (b.surface) cells.push({ v: `${b.surface} m²`, l: 'Surface' });
    if (b.nb_pieces) cells.push({ v: `${b.nb_pieces}`, l: b.nb_pieces > 1 ? 'Pièces' : 'Pièce' });
    if (b.nb_chambres) cells.push({ v: `${b.nb_chambres}`, l: b.nb_chambres > 1 ? 'Chambres' : 'Chambre' });
    if (etageTxt) cells.push({ v: etageTxt, l: 'Étage' });
    const statsRow = cells.map((c, i) => `${i > 0 ? '<td width="1" style="background:#f0ece3;"></td>' : ''}<td align="center" style="padding:10px 6px;"><div style="font-size:17px;font-weight:700;color:${BLEU};">${c.v}</div><div style="font-size:11px;color:#9aa6ba;margin-top:2px;">${c.l}</div></td>`).join('');
    return `
      ${photo ? `<tr><td style="padding:0;"><img src="${escapeHtml(photo)}" alt="" width="600" style="width:100%;max-width:600px;height:auto;display:block;border:0;" /></td></tr>` : ''}
      <tr><td style="padding:24px 28px 8px;">
        <div style="font-size:20px;font-weight:700;color:${BLEU};line-height:1.3;margin-bottom:6px;">${escapeHtml(titreOf(b))}</div>
        ${loc ? `<div style="font-size:13px;color:#7a879b;"><span style="color:${DORE};">&#9679;</span> ${escapeHtml(loc)}</div>` : ''}
      </td></tr>
      ${statsRow ? `<tr><td style="padding:14px 28px 4px;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-top:1px solid #f0ece3;border-bottom:1px solid #f0ece3;"><tr>${statsRow}</tr></table></td></tr>` : ''}
      <tr><td style="padding:18px 28px 6px;">
        ${prix ? `<div style="font-size:26px;font-weight:800;color:${BLEU};line-height:1;">${fmt(prix)} €</div><div style="font-size:11px;color:${DORE};font-weight:600;margin:6px 0 18px;">${b.prix_acquereur ? 'Prix FAI · honoraires inclus' : 'Prix'}</div>` : ''}
        <a href="${lienBien(b, token, rech)}" style="display:block;background:${BLEU};color:#ffffff;text-decoration:none;text-align:center;padding:15px;border-radius:11px;font-size:15px;font-weight:600;">Consulter le bien &rarr;</a>
      </td></tr>`;
  }

  function multiItem(b: BienLite, idx: number, total: number): string {
    const photo = photoOf(b);
    const prix = prixOf(b);
    const loc = locOf(b);
    const etageTxt = etageOf(b);
    const carac = [b.surface ? `${b.surface} m²` : '', b.nb_pieces ? `${b.nb_pieces} p.` : '', b.nb_chambres ? `${b.nb_chambres} ch.` : '', etageTxt ? `${etageTxt} ét.` : ''].filter(Boolean).join(' · ');
    return `
      <tr><td style="padding:${idx === 0 ? '20' : '18'}px 28px 18px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
          <td width="150" class="miphoto" style="vertical-align:top;">
            ${photo ? `<img src="${escapeHtml(photo)}" alt="" width="150" class="miimg" style="width:150px;height:115px;object-fit:cover;display:block;border-radius:10px;border:0;" />` : `<div class="miimg" style="width:150px;height:115px;background:${BLEU};border-radius:10px;"></div>`}
          </td>
          <td class="mibody" style="vertical-align:top;padding-left:16px;">
            <div style="font-size:15px;font-weight:700;color:${BLEU};margin-bottom:3px;">${escapeHtml(titreOf(b))}</div>
            ${loc ? `<div style="font-size:12px;color:#7a879b;margin-bottom:6px;"><span style="color:${DORE};">&#9679;</span> ${escapeHtml(loc)}</div>` : ''}
            ${carac ? `<div style="font-size:12px;color:#5a6a85;margin-bottom:8px;">${escapeHtml(carac)}</div>` : ''}
            ${prix ? `<div style="font-size:17px;font-weight:800;color:${BLEU};margin-bottom:8px;">${fmt(prix)} €</div>` : ''}
            <a href="${lienBien(b, token, rech)}" style="color:${DORE};text-decoration:none;font-size:13px;font-weight:700;">Consulter le bien &rarr;</a>
          </td>
        </tr></table>
      </td></tr>
      ${idx < total - 1 ? hairline : ''}`;
  }

  const propertyRows = single
    ? singleBloc(biens[0])
    : biens.map((b, i) => multiItem(b, i, biens.length)).join('');

  return `<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width,initial-scale=1" />
<title>Emilio Immobilier</title>
<style>
  @media only screen and (max-width:600px) {
    .sheet { width:100% !important; }
    .miphoto, .mibody { display:block !important; width:100% !important; padding-left:0 !important; }
    .miphoto .miimg { width:100% !important; height:190px !important; margin-bottom:12px; }
  }
</style>
</head>
<body style="margin:0;padding:0;background:#e7e1d4;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#e7e1d4;">
    <tr><td align="center" style="padding:26px 12px;">

      <!-- FEUILLE UNIQUE -->
      <table role="presentation" width="600" class="sheet" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;width:100%;background:#ffffff;border:1px solid #e3d8c4;border-radius:18px;overflow:hidden;">

        <!-- En-tête -->
        <tr><td style="background:${BLEU};border-bottom:3px solid ${DORE};padding:20px 28px;">
          <table role="presentation" width="100%"><tr>
            <td><img src="${SITE_URL}/logo_high_resolution_white.png" alt="Emilio Immobilier" height="34" style="height:34px;width:auto;display:block;border:0;" /></td>
            <td align="right" style="font-size:10px;color:${DORE};letter-spacing:2.5px;font-weight:600;">SÉLECTION PRIVÉE</td>
          </tr></table>
        </td></tr>

        <!-- Message -->
        <tr><td style="padding:26px 28px 4px;">
          <div style="font-size:14.5px;color:#3a4a5f;line-height:1.7;">${corpsHtml}</div>
        </td></tr>

        ${biens.length > 0 ? softDivider : ''}

        <!-- Annonce(s) -->
        ${propertyRows}

        <!-- Pied -->
        <tr><td style="background:${BLEU};padding:20px 28px;margin-top:10px;">
          <table role="presentation" width="100%"><tr>
            <td>
              <div style="font-size:14px;font-weight:700;color:#ffffff;">Alexandre Rogelet</div>
              <!-- ⚠️ Jamais « chasse » ni « chasseur » dans un texte que le client lit. -->
              <div style="font-size:11px;color:rgba(255,255,255,0.55);margin-top:3px;">Recherche immobilière sur mesure · Paris &amp; Hauts-de-Seine</div>
            </td>
            <td align="right" style="color:${DORE};font-size:15px;font-weight:700;white-space:nowrap;">06 58 95 76 32</td>
          </tr></table>
        </td></tr>

      </table>

      <!-- Sous la feuille, en gris sur gris : la sortie.
           Elle a sa place dans chaque envoi — un client qui a trouvé ailleurs
           et qui continue de recevoir des biens finit par ne plus ouvrir du
           tout. Mieux vaut qu'il le dise, et qu'Alexandre l'apprenne. -->
      <table role="presentation" width="600" class="sheet" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;width:100%;">
        <tr><td align="center" style="padding:16px 28px 6px;">
          <div style="font-size:11.5px;color:#9aa6ba;line-height:1.7;">
            Vous recevez ce message parce que votre recherche est en cours avec Emilio Immobilier.${
              lienFin(token)
                ? `<br/><a href="${lienFin(token)}" style="color:#7a879b;text-decoration:underline;">Je ne suis plus en recherche</a>`
                : ''
            }
          </div>
        </td></tr>
      </table>

    </td></tr>
  </table>
</body>
</html>`;
}




/* ══ Le mail de bienvenue ══
   Il part une fois, à l'ouverture de la recherche. Son seul travail : faire
   ouvrir l'espace et le faire poser sur l'écran d'accueil du téléphone. Un
   client qui l'a installé reçoit les biens en notification ; les autres
   attendent un mail qu'ils ouvriront peut-être.

   Pas de biens dedans, pas de chiffres : c'est une mise en route, pas une
   proposition. Et un seul bouton — plusieurs liens dilueraient le geste.

   ⚠️ Les vignettes sont des emoji, pas des SVG ni des images hébergées.
   Gmail n'affiche pas les SVG, et une image servie depuis le site peut être
   bloquée tant que le client n'a pas cliqué « afficher les images ». Un emoji
   s'affiche partout, sans rien à servir. */
function buildBienvenue(opts: { prenom: string; token?: string | null }): string {
  const { token } = opts;
  const prenom = escapeHtml(opts.prenom);
  const lien = token ? lienEspace(token, SITE_URL) : SITE_URL;

  /* L'emoji posé dans le même rond ivoire bordé d'or que dans l'espace. */
  const rond = (e: string, t = 44, police = 20) => `
    <table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>
      <td align="center" valign="middle" width="${t}" height="${t}" style="width:${t}px;height:${t}px;background:#fdfaf1;border:1px solid #ecdcb4;border-radius:${Math.round(t / 2)}px;text-align:center;line-height:${t}px;"><span style="font-size:${police}px;line-height:${t}px;">${e}</span></td>
    </tr></table>`;

  /* Les trois lignes restent alignées à gauche : ce sont des listes, elles se
     lisent mal centrées, et la vignette donne le rail visuel. */
  const puce = (e: string, titre: string, texte: string) => `
    <tr><td style="padding:0 0 15px;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
        <td width="56" valign="top">${rond(e)}</td>
        <td valign="top" style="padding-left:2px;">
          <div style="font-size:14.5px;font-weight:700;color:${BLEU};line-height:1.35;padding-top:6px;">${titre}</div>
          <div style="font-size:13.5px;color:#6b7b90;line-height:1.65;margin-top:4px;">${texte}</div>
        </td></tr></table></td></tr>`;

  return `<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width,initial-scale=1" />
<title>Emilio Immobilier</title>
<style>
  @media only screen and (max-width:600px) { .sheet { width:100% !important; } }
</style>
</head>
<body style="margin:0;padding:0;background:#e7e1d4;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#e7e1d4;">
    <tr><td align="center" style="padding:26px 12px;">

      <table role="presentation" width="600" class="sheet" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;width:100%;background:#ffffff;border:1px solid #e3d8c4;border-radius:18px;overflow:hidden;">

        <tr><td style="background:${BLEU};border-bottom:3px solid ${DORE};padding:20px 28px;">
          <table role="presentation" width="100%"><tr>
            <td><img src="${SITE_URL}/logo_high_resolution_white.png" alt="Emilio Immobilier" height="34" style="height:34px;width:auto;display:block;border:0;" /></td>
            <td align="right" style="font-size:10px;color:${DORE};letter-spacing:2.5px;font-weight:600;">VOTRE ESPACE</td>
          </tr></table>
        </td></tr>

        <!-- L'accueil, centré : c'est la seule partie du mail qui doit se lire
             comme une parole, pas comme une fiche. -->
        <tr><td align="center" style="padding:32px 34px 0;">
          <div style="font-family:Georgia,'Times New Roman',serif;font-size:24px;font-weight:700;color:${BLEU};line-height:1.3;">Bienvenue, ${prenom}.</div>
          <div style="font-size:14.5px;color:#3a4a5f;line-height:1.75;margin-top:12px;">
            Ravi de commencer cette recherche avec vous. Elle est enregistrée&nbsp;: j&#39;ai maintenant
            ce qu&#39;il me faut pour parcourir le marché, et je vous ai ouvert un espace personnel
            où tout se retrouve au même endroit.
          </div>
        </td></tr>

        <tr><td align="center" style="padding:26px 28px 6px;">
          <table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>
            <td align="center" style="background:${DORE};border-radius:12px;">
              <a href="${lien}" style="display:inline-block;padding:15px 32px;font-size:15.5px;font-weight:700;color:${BLEU};text-decoration:none;">&#128273;&nbsp;&nbsp;Ouvrir mon espace</a>
            </td>
          </tr></table>
          <div style="font-size:12px;color:#9aa6ba;margin-top:11px;">Ce lien est le vôtre, il ne change pas.</div>
        </td></tr>

        <tr><td style="padding:26px 28px 0;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
            ${puce('&#11088;', 'Les biens retenus pour vous', 'Ils arrivent au fil de l&#39;eau. Vous dites en un geste ce que vous en pensez — et c&#39;est ce qui affine la suite.')}
            ${puce('&#9999;&#65039;', 'Vos critères, modifiables à tout moment', 'Un budget qui bouge, un secteur à ajouter : vous le changez vous-même, j&#39;en tiens compte dès la recherche suivante.')}
            ${puce('&#128270;', 'L&#39;avancée de votre dossier', 'Ce qui a été parcouru, ce qui a été retenu, vos visites à venir.')}
          </table>
        </td></tr>

        <!-- Le conseil. C'est la ligne la plus rentable du mail : un client qui
             pose l'espace sur son écran d'accueil reçoit les biens en
             notification, les autres les découvrent trois jours plus tard. -->
        <tr><td style="padding:8px 28px 0;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${FOND};border:1px solid #ecdcb4;border-radius:14px;">
            <tr>
              <td width="78" align="center" valign="top" style="padding:17px 0 17px 16px;">${rond('&#9889;', 52, 26)}</td>
              <td style="padding:17px 18px 17px 10px;">
                <div style="font-size:14.5px;font-weight:700;color:${BLEU};">Le conseil qui change tout</div>
                <div style="font-size:13.5px;color:#5a6b80;line-height:1.65;margin-top:6px;">
                  Ouvrez ce lien depuis votre téléphone, puis ajoutez-le à votre écran d&#39;accueil
                  (le menu du navigateur, «&nbsp;Ajouter à l&#39;écran d&#39;accueil&nbsp;»). Vous serez
                  prévenu dès qu&#39;un bien vous est proposé, sans avoir à guetter vos mails —
                  et sur ce marché, quelques heures font souvent la différence.
                </div>
              </td>
            </tr>
          </table>
        </td></tr>

        <!-- Coupée en deux lignes : un bloc centré de longueurs inégales tient mal. -->
        <tr><td align="center" style="padding:24px 40px 28px;">
          <div style="font-size:14.5px;color:#3a4a5f;line-height:1.75;">
            Une question, une précision à me donner&nbsp;?<br/>Répondez simplement à ce message, ou appelez-moi.
          </div>
        </td></tr>

        <tr><td style="background:${BLEU};padding:20px 28px;">
          <table role="presentation" width="100%"><tr>
            <td>
              <div style="font-size:14px;font-weight:700;color:#ffffff;">Alexandre Rogelet</div>
              <!-- ⚠️ Jamais « chasse » ni « chasseur » dans un texte que le client lit. -->
              <div style="font-size:11px;color:rgba(255,255,255,0.55);margin-top:3px;">Recherche immobilière sur mesure · Paris &amp; Hauts-de-Seine</div>
            </td>
            <td align="right" style="color:${DORE};font-size:15px;font-weight:700;white-space:nowrap;">06 58 95 76 32</td>
          </tr></table>
        </td></tr>

      </table>

      <table role="presentation" width="600" class="sheet" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;width:100%;">
        <tr><td align="center" style="padding:16px 28px 6px;">
          <div style="font-size:11.5px;color:#9aa6ba;line-height:1.7;">
            Vous recevez ce message parce que votre recherche est en cours avec Emilio Immobilier.${
              lienFin(token)
                ? `<br/><a href="${lienFin(token)}" style="color:#7a879b;text-decoration:underline;">Je ne suis plus en recherche</a>`
                : ''
            }
          </div>
        </td></tr>
      </table>

    </td></tr>
  </table>
</body>
</html>`;
}

/* La version texte, pour les messageries qui n'affichent pas le HTML. */
function texteBienvenue(prenom: string, token?: string | null): string {
  const lien = token ? lienEspace(token, SITE_URL) : SITE_URL;
  return `Bienvenue, ${prenom}.

Ravi de commencer cette recherche avec vous. Elle est enregistrée : j'ai maintenant ce qu'il me faut pour parcourir le marché, et je vous ai ouvert un espace personnel où tout se retrouve au même endroit.

Ouvrir mon espace : ${lien}
Ce lien est le vôtre, il ne change pas.

- Les biens retenus pour vous. Ils arrivent au fil de l'eau, et vous dites en un geste ce que vous en pensez.
- Vos critères, modifiables à tout moment. Vous les changez vous-même, j'en tiens compte dès la recherche suivante.
- L'avancée de votre dossier. Ce qui a été parcouru, ce qui a été retenu, vos visites à venir.

Le conseil qui change tout : ouvrez ce lien depuis votre téléphone, puis ajoutez-le à votre écran d'accueil. Vous serez prévenu dès qu'un bien vous est proposé, sans avoir à guetter vos mails.

Une question, une précision à me donner ? Répondez simplement à ce message, ou appelez-moi.

Alexandre ROGELET — Emilio Immobilier
06 58 95 76 32${lienFin(token) ? `\n\n---\nVous n'êtes plus en recherche ? Dites-le-nous : ${lienFin(token)}` : ''}`;
}


/* ══ La deuxième recherche ══
   Le client a déjà son espace, et souvent déjà l'icône sur son téléphone. On
   ne lui renvoie donc PAS un mail de bienvenue : ni nouveau lien, ni « posez
   ceci sur votre écran d'accueil » — il l'a fait. Un mot court, qui dit
   seulement que la recherche est ouverte et qu'elle se trouve au même
   endroit que l'autre.

   Le bouton porte quand même le lien : c'est le même qu'avant, et c'est le
   geste le plus court pour aller voir. */
function buildNouvelle(opts: { prenom: string; recherche: string; token?: string | null; total?: number }): string {
  const { token } = opts;
  /* Deux recherches, ou davantage : les tournures ne sont pas les mêmes, et
     « à côté de la première » sonnerait faux sur la quatrième. */
  const deux = (opts.total || 2) <= 2;
  const prenom = escapeHtml(opts.prenom);
  const recherche = escapeHtml(opts.recherche);
  const lien = token ? lienEspace(token, SITE_URL) : SITE_URL;

  const rond = (e: string, t = 44, police = 20) => `
    <table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>
      <td align="center" valign="middle" width="${t}" height="${t}" style="width:${t}px;height:${t}px;background:#fdfaf1;border:1px solid #ecdcb4;border-radius:${Math.round(t / 2)}px;text-align:center;line-height:${t}px;"><span style="font-size:${police}px;line-height:${t}px;">${e}</span></td>
    </tr></table>`;

  const puce = (e: string, titre: string, texte: string) => `
    <tr><td style="padding:0 0 15px;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
        <td width="56" valign="top">${rond(e)}</td>
        <td valign="top" style="padding-left:2px;">
          <div style="font-size:14.5px;font-weight:700;color:${BLEU};line-height:1.35;padding-top:6px;">${titre}</div>
          <div style="font-size:13.5px;color:#6b7b90;line-height:1.65;margin-top:4px;">${texte}</div>
        </td></tr></table></td></tr>`;

  return `<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width,initial-scale=1" />
<title>Emilio Immobilier</title>
<style>
  @media only screen and (max-width:600px) { .sheet { width:100% !important; } }
</style>
</head>
<body style="margin:0;padding:0;background:#e7e1d4;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#e7e1d4;">
    <tr><td align="center" style="padding:26px 12px;">

      <table role="presentation" width="600" class="sheet" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;width:100%;background:#ffffff;border:1px solid #e3d8c4;border-radius:18px;overflow:hidden;">

        <tr><td style="background:${BLEU};border-bottom:3px solid ${DORE};padding:20px 28px;">
          <table role="presentation" width="100%"><tr>
            <td><img src="${SITE_URL}/logo_high_resolution_white.png" alt="Emilio Immobilier" height="34" style="height:34px;width:auto;display:block;border:0;" /></td>
            <td align="right" style="font-size:10px;color:${DORE};letter-spacing:2.5px;font-weight:600;">VOTRE ESPACE</td>
          </tr></table>
        </td></tr>

        <tr><td align="center" style="padding:32px 34px 0;">
          <div style="font-family:Georgia,'Times New Roman',serif;font-size:24px;font-weight:700;color:${BLEU};line-height:1.3;">${deux ? 'Une deuxième recherche' : 'Une nouvelle recherche'}, ${prenom}.</div>
          <div style="font-size:14.5px;color:#3a4a5f;line-height:1.75;margin-top:12px;">
            <b style="color:${BLEU};">${recherche}</b> est enregistrée. Elle s&#39;ajoute à votre espace,
            à côté ${deux ? 'de la première' : 'des précédentes'}&nbsp;: vous n&#39;avez rien de nouveau
            à installer, c&#39;est le même endroit et le même lien qu&#39;avant.
          </div>
        </td></tr>

        <tr><td align="center" style="padding:26px 28px 6px;">
          <table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>
            <td align="center" style="background:${DORE};border-radius:12px;">
              <a href="${lien}" style="display:inline-block;padding:15px 32px;font-size:15.5px;font-weight:700;color:${BLEU};text-decoration:none;">&#128273;&nbsp;&nbsp;Ouvrir mon espace</a>
            </td>
          </tr></table>
        </td></tr>

        <tr><td style="padding:26px 28px 0;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
            ${puce('&#128260;',
              deux ? 'Vos deux recherches au même endroit' : 'Toutes vos recherches au même endroit',
              `Tout en haut de votre espace, une ligne indique celle que vous êtes en train de regarder. Appuyez dessus pour ${deux ? 'passer à l&#39;autre' : 'changer'}.`)}
            ${puce('&#11088;',
              deux ? 'Les biens arrivent dans les deux' : 'Les biens arrivent dans chacune',
              'Vous êtes prévenu de la même façon, quelle que soit la recherche concernée.')}
          </table>
        </td></tr>

        <tr><td align="center" style="padding:14px 40px 28px;">
          <div style="font-size:14.5px;color:#3a4a5f;line-height:1.75;">
            Une question, une précision à me donner&nbsp;?<br/>Répondez simplement à ce message, ou appelez-moi.
          </div>
        </td></tr>

        <tr><td style="background:${BLEU};padding:20px 28px;">
          <table role="presentation" width="100%"><tr>
            <td>
              <div style="font-size:14px;font-weight:700;color:#ffffff;">Alexandre Rogelet</div>
              <!-- ⚠️ Jamais « chasse » ni « chasseur » dans un texte que le client lit. -->
              <div style="font-size:11px;color:rgba(255,255,255,0.55);margin-top:3px;">Recherche immobilière sur mesure · Paris &amp; Hauts-de-Seine</div>
            </td>
            <td align="right" style="color:${DORE};font-size:15px;font-weight:700;white-space:nowrap;">06 58 95 76 32</td>
          </tr></table>
        </td></tr>

      </table>

      <table role="presentation" width="600" class="sheet" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;width:100%;">
        <tr><td align="center" style="padding:16px 28px 6px;">
          <div style="font-size:11.5px;color:#9aa6ba;line-height:1.7;">
            Vous recevez ce message parce que votre recherche est en cours avec Emilio Immobilier.${
              lienFin(token)
                ? `<br/><a href="${lienFin(token)}" style="color:#7a879b;text-decoration:underline;">Je ne suis plus en recherche</a>`
                : ''
            }
          </div>
        </td></tr>
      </table>

    </td></tr>
  </table>
</body>
</html>`;
}

function texteNouvelle(prenom: string, recherche: string, token?: string | null, total?: number): string {
  const lien = token ? lienEspace(token, SITE_URL) : SITE_URL;
  const deux = (total || 2) <= 2;
  return `${deux ? 'Une deuxième recherche' : 'Une nouvelle recherche'}, ${prenom}.

${recherche} est enregistrée. Elle s'ajoute à votre espace, à côté ${deux ? 'de la première' : 'des précédentes'} : vous n'avez rien de nouveau à installer, c'est le même endroit et le même lien qu'avant.

Ouvrir mon espace : ${lien}

- ${deux ? 'Vos deux recherches' : 'Toutes vos recherches'} au même endroit. Tout en haut de votre espace, une ligne indique celle que vous êtes en train de regarder. Appuyez dessus pour ${deux ? "passer à l'autre" : 'changer'}.
- Les biens arrivent dans ${deux ? 'les deux' : 'chacune'}. Vous êtes prévenu de la même façon, quelle que soit la recherche concernée.

Une question, une précision à me donner ? Répondez simplement à ce message, ou appelez-moi.

Alexandre ROGELET — Emilio Immobilier
06 58 95 76 32${lienFin(token) ? `\n\n---\nVous n'êtes plus en recherche ? Dites-le-nous : ${lienFin(token)}` : ''}`;
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
      mode?: 'libre' | 'biens' | 'bienvenue'; // 'libre' = mail texte, 'bienvenue' = mise en route, 'biens' = défaut
    };
    /* Le mail de bienvenue s'écrit tout seul : ni objet ni corps à saisir,
       et surtout aucun bien. On le traite donc avant les contrôles. */
    const bienvenue = mode === 'bienvenue';

    if (!Array.isArray(client_ids) || client_ids.length === 0) {
      return NextResponse.json({ error: 'Aucun destinataire' }, { status: 400 });
    }
    if (!bienvenue && !objet?.trim()) {
      return NextResponse.json({ error: "L'objet est obligatoire" }, { status: 400 });
    }
    if (bienvenue && !recherche_id) {
      return NextResponse.json({ error: 'Recherche manquante' }, { status: 400 });
    }

    // Récupère clients
    const { data: clients } = await supabase
      .from('clients')
      .select('id, prenom, nom, emails, token_espace')
      .in('id', client_ids);

    if (!clients || clients.length === 0) {
      return NextResponse.json({ error: 'Clients introuvables' }, { status: 404 });
    }

    /* Le jeton de l'espace acheteur, pour que chaque bouton du mail ouvre la
       bonne fiche. S'il manque, les liens retombent sur la page publique :
       le mail part quand même, il est juste moins bien.

       ⚠️ C'est le jeton du CLIENT qu'on envoie (voir src/lib/espace.ts) : le
       même lien toute sa vie, quel que soit le nombre de recherches. Celui de
       la recherche ne sert plus qu'en secours, pour les dossiers qui n'ont
       pas encore été repris. */
    let tokenEspace: string | null = null;
    let recherche: Record<string, unknown> | null = null;
    if (recherche_id) {
      const { data: rech } = await supabase
        .from('recherches').select('*, clients(token_espace)').eq('id', recherche_id).maybeSingle();
      recherche = (rech as Record<string, unknown>) || null;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      tokenEspace = ((rech as any)?.clients?.token_espace as string) || (rech?.token_espace as string) || null;
    }

    /* Mise en route, ou recherche qui s'ajoute à un espace déjà ouvert ?
       On ne le demande pas au CRM : on le lit en base, comme ça les deux ne
       peuvent pas se contredire. Le client qui a déjà reçu son lien ne doit
       pas en recevoir un deuxième — il n'a rien à réinstaller. */
    let nouvelleRecherche = false;
    let totalRecherches = 2;
    if (bienvenue && recherche?.client_id) {
      const { data: soeurs } = await supabase
        .from('recherches').select('id')
        .eq('client_id', recherche.client_id as string)
        .neq('id', recherche_id as string)
        .not('bienvenue_envoye_le', 'is', null)
        .limit(1);
      nouvelleRecherche = !!(soeurs && soeurs.length > 0);
      if (nouvelleRecherche) {
        const { count } = await supabase
          .from('recherches').select('id', { count: 'exact', head: true })
          .eq('client_id', recherche.client_id as string);
        totalRecherches = count || 2;
      }
    }

    /* Le nom qu'on montre au client. « Recherche 2 » ne lui dit rien : on
       retombe alors sur ses critères, comme dans son espace. */
    const nomRecherche = recherche
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ? nommerRecherche(recherche as any, 2)
      : 'Votre nouvelle recherche';

    // Récupère les biens UNIQUEMENT si mode != 'libre'
    let tousBiens: (BienLite & { client_id: string })[] = [];
    if (mode !== 'libre' && !bienvenue) {
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
      /* Chaque client reçoit SON lien. Celui tiré de la recherche ne sert
         qu'en secours, pour les dossiers pas encore repris. */
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const jeton = ((client as any).token_espace as string) || tokenEspace;

      const corpsPerso = bienvenue
        ? (nouvelleRecherche
          ? texteNouvelle(client.prenom, nomRecherche, jeton, totalRecherches)
          : texteBienvenue(client.prenom, jeton))
        : corps.replace(/\{\{prénom\}\}/g, client.prenom);
      const objetFinal = bienvenue
        ? (nouvelleRecherche ? 'Votre nouvelle recherche est ouverte' : 'Votre espace de recherche est ouvert')
        : objet;
      const html = bienvenue
        ? (nouvelleRecherche
          ? buildNouvelle({ prenom: client.prenom, recherche: nomRecherche, token: jeton, total: totalRecherches })
          : buildBienvenue({ prenom: client.prenom, token: jeton }))
        : buildHtml({ prenom: client.prenom, corps: corpsPerso, biens: biensClient, token: jeton, recherche: recherche_id || null });
      const text = `Bonjour ${client.prenom},\n\n${corpsPerso}\n\n${biensClient.length > 0 ? `Biens proposés :\n${biensClient.map(b => `- ${b.titre || 'Bien'} : ${lienBien(b, jeton, recherche_id || null)}`).join('\n')}\n\n` : ''}Cordialement,\nAlexandre ROGELET — Emilio Immobilier\n06 58 95 76 32${
        lienFin(jeton) ? `\n\n---\nVous n'êtes plus en recherche ? Dites-le-nous : ${lienFin(jeton)}` : ''
      }`;

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
              Subject: objetFinal,
              TextPart: bienvenue ? corpsPerso : text,
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
          /* Le mail de bienvenue ne part qu'une fois : on horodate la recherche,
             et c'est cette date qui grise le bouton dans le CRM. On l'écrit
             après l'envoi, jamais avant — un échec Mailjet ne doit pas
             condamner le bouton. */
          if (bienvenue) {
            await supabase.from('recherches')
              .update({ bienvenue_envoye_le: new Date().toISOString() })
              .eq('id', recherche_id);
          }
          const typeEnvoi = bienvenue ? 'mail_libre'
            : biensClient.length === 0 ? 'mail_libre'
              : biensClient.length === 1 ? 'envoi_bien' : 'selection_biens';
          await supabase.from('envois').insert({
            client_id: client.id,
            recherche_id: recherche_id || null,
            type: typeEnvoi,
            objet: objetFinal,
            corps: corpsPerso,
            destinataires: emails,
            biens_ids: biensClient.map(b => b.id),
            sms_envoye: false,
          });
          const titreJournal = bienvenue
            ? '👋 Mail de bienvenue envoyé'
            : biensClient.length === 0
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
