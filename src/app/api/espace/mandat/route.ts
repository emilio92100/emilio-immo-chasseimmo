import { NextRequest, NextResponse } from 'next/server';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { createHash, randomInt, randomUUID, timingSafeEqual } from 'crypto';
import {
  redigerMandat, resumeMandat, figerContenu, etatMandat, finRetractation, masquerEmail, validerMandant, validerPersonne, validerSociete,
  dateLongue, dateCourte, heureParis, jourParis, titreMandat, honorairesCourt, euros, DUREE, RETRACTATION_JOURS, COSIGNATAIRES_MAX,
  rechercheDepuis, versionMandat, decrireRecherche, type Mandant, type Contenu, type Societe,
} from '@/lib/mandat';
import {
  lireCos, lienNeuf, envoyerLien, inviter, sceller, rangerGriffe, envoyerExemplaire, finRetractationDe, nomDe,
  type Co, type LigneMandat,
} from '@/lib/cosignature';
import { pdfMandat, pdfSigne } from '@/lib/mandat-pdf';
import { PDFDocument } from 'pdf-lib';
import { lireReserve, prendreNumero, envoyerMail, gabarit, echappe, ALERTES, CRM, appareilDe, RESERVE_ALERTE, mandatDocumentEnRoute, adressesClient } from '@/lib/mandat-serveur';
import { alerteMailActive } from '@/lib/alertes';
import { ecritServeur } from '@/lib/ecritures';
import { lireIdentiteAgence } from '@/lib/agence';
import { inscrire, numeroAncien, observer, type LigneRegistre } from '@/lib/registre';

/**
 * La signature du mandat de recherche, depuis l'espace client.
 *
 *   POST /api/espace/mandat  { token, etape: 'afficher' }
 *        le client ouvre le parcours : on le note (c'est la 1re ligne du
 *        déroulé du certificat)
 *   POST /api/espace/mandat  { token, etape: 'code', mandant, version }
 *        il confirme ses coordonnées : le mandat reçoit son numéro, et un
 *        code à 6 chiffres part à son adresse. `version` est l'empreinte de
 *        ce qu'il a lu (versionMandat) : si Alexandre a changé le taux
 *        entre-temps, on lui renvoie la nouvelle version à relire
 *   POST /api/espace/mandat  { token, etape: 'question', bienId? }
 *        « Une question sur le mandat ? Être rappelé » : Alexandre reçoit
 *        une relance du jour et un mail, avec le bien concerné
 *   POST /api/espace/mandat  { token, etape: 'signer', code, execution, accepte }
 *        il saisit le code : PDF, empreinte, certificat, dossier privé, fiche
 *        du CRM remplie, copies par mail
 *   POST /api/espace/mandat  { token, etape: 'pdf' }
 *        un lien d'une minute vers son mandat signé
 *   POST /api/espace/mandat  { token, etape: 'renoncer', confirme }
 *        la rétractation en ligne, pendant 14 jours (obligatoire depuis le
 *        19 juin 2026 pour un contrat conclu sur une interface en ligne)
 *   POST /api/espace/mandat  { token, etape: 'relancer', coId }
 *   POST /api/espace/mandat  { token, etape: 'corriger', coId, email }
 *        il signe à plusieurs : il renvoie son lien à son conjoint, ou
 *        corrige son adresse (un lien neuf part, l'ancien ne marche plus)
 *
 * À plusieurs (src/lib/cosignature.ts) : `code` reçoit aussi `cosignataires`
 * (son conjoint, ses co-acquéreurs) ou `societe` (il achète via une
 * société, `kbis` facultatif). À sa signature, la ligne passe en 'partiel',
 * chaque co-signataire reçoit son lien (/signer/<jeton>), et le mandat
 * l'engage déjà : la fiche du CRM se remplit comme s'il signait seul.
 *
 * Même serrure que les autres routes de l'espace : le jeton de la recherche.
 * Le texte vient de src/lib/mandat.ts — le même que celui que le client a lu.
 */

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

function base() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
}

const SECRET = process.env.SUPABASE_SERVICE_ROLE_KEY || 'emilio-mandat';
const CODE_MINUTES = 15;
const CODE_ESSAIS = 5;
const CODES_MAX = 6;
const ECART_ENVOIS_S = 45;
const BUCKET = 'mandats';
const SIGNATURE_AGENCE = 'agence/signature.png';

const hacher = (code: string, id: string) => createHash('sha256').update(`${code}:${id}:${SECRET}`).digest('hex');
const egal = (a: string, b: string) => {
  const x = Buffer.from(a), y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
};
const ko = (error: string, status = 400, plus: Record<string, unknown> = {}) =>
  NextResponse.json({ ok: false, error, ...plus }, { status });

type Ligne = {
  id: string; numero: string; statut: string; mandant: Mandant; contenu: Contenu & { agenceLe?: string | null; source?: string };
  code_hash: string | null; code_expire_le: string | null; code_essais: number; codes_envoyes: number;
  code_envoye_le: string | null; signe_le: string | null; pdf_chemin: string | null; deroule: { t: string; x: string }[];
  execution_immediate: boolean | null; email_verifie: string | null; retracte_le: string | null;
  /* Colonnes du SQL « signature-plusieurs » : absentes avant qu'il soit lancé. */
  societe?: Societe | null; kbis_chemin?: string | null; griffe_chemin?: string | null;
};

/* Le Kbis, joint à la demande de code : un PDF ou une photo (déjà réduite
   par le navigateur), 3 Mo au plus une fois décodé. */
function lireKbis(v: unknown): { octets: Uint8Array; ext: string; type: string } | null {
  if (typeof v !== 'string') return null;
  const m = /^data:(application\/pdf|image\/jpeg|image\/png);base64,/.exec(v);
  if (!m || v.length > 4_200_000) return null;
  const octets = new Uint8Array(Buffer.from(v.slice(m[0].length), 'base64'));
  if (octets.length < 500) return null;
  return { octets, ext: m[1] === 'application/pdf' ? 'pdf' : m[1] === 'image/png' ? 'png' : 'jpg', type: m[1] };
}

/* Les mandants tels que le registre des mandats les inscrit (V3.18) : lui,
   ceux qui signent avec lui, ou la société qu'il représente. */
function mandantsRegistre(m: Mandant, cos: Mandant[], soc: Societe | null): string {
  const p = (x: Mandant) => [[x.civilite, x.prenom, (x.nom || '').toUpperCase()].filter(Boolean).join(' '), x.adresse].filter(Boolean).join(', ');
  if (soc) return [`${soc.forme} ${soc.denomination}`.trim(), `SIREN ${soc.siren}`, soc.rcsVille ? `RCS ${soc.rcsVille}` : '', `représentée par ${p(m)}`].filter(Boolean).join(', ');
  return [m, ...cos].map(p).join(' ; ');
}

/* Le registre n'a pas pu noter (V3.18) : Alexandre le sait, et l'ajoute à
   la main (Documents › Registre des mandats › Ajouter une observation). */
async function alerteRegistre(pb: string | null, numero: string, quoi: string) {
  if (!pb) return;
  console.error('[registre]', pb);
  await envoyerMail({
    a: ALERTES(), deLaPartDe: 'crm',
    sujet: `Registre des mandats : « ${quoi} » à noter sur le n° ${numero}`,
    texte: `Le registre des mandats n'a pas pu noter « ${quoi} » sur le mandat n° ${numero} (${pb}). Ajoute l'observation à la main : Documents › Registre des mandats.\n\n${CRM()}/?page=registre`,
    html: gabarit('Une observation à ajouter au registre', `<p>Le registre des mandats n’a pas pu noter « ${echappe(quoi)} » sur le mandat <b>n° ${echappe(numero)}</b>.</p><p style="color:#b91c1c">${echappe(pb)}</p><p>Ajoute l’observation à la main : Documents › Registre des mandats.</p>`),
  });
}

async function derniere(sb: SupabaseClient, rechercheId: string): Promise<Ligne | null> {
  const { data, error } = await sb.from('mandats_signatures').select('*')
    .eq('recherche_id', rechercheId).order('created_at', { ascending: false }).limit(1).maybeSingle();
  if (error || !data) return null;
  return data as Ligne;
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const token = typeof body?.token === 'string' ? body.token : '';
    if (!token || token.length < 12 || token.length > 128) return ko('lien invalide', 401);
    const etape = String(body?.etape || '');
    const sb = base();

    /* ── la serrure ── */
    const { data: recherche } = await sb.from('recherches').select('*').eq('token_espace', token).maybeSingle();
    if (!recherche || recherche.espace_actif === false) return ko('lien invalide', 401);
    const { data: client } = await sb.from('clients').select('*').eq('id', recherche.client_id).maybeSingle();
    if (!client) return ko('lien invalide', 401);

    const evt = (type: string, detail: string | null) =>
      ecritServeur('Le suivi de l’espace', sb.from('espace_evenements').insert({ recherche_id: recherche.id, client_id: recherche.client_id, bien_id: null, type, detail }));
    const nomClient = `${client.prenom || ''} ${client.nom || ''}`.trim() || 'Un client';
    const lienCrm = `${CRM()}/?page=fiche&client=${encodeURIComponent(recherche.client_id)}`;

    /* Un mandat de recherche préparé dans Documents (V3.32), pas encore
       signé : c'est lui qu'il signe. Pas de second mandat par l'espace. */
    if ((etape === 'afficher' || etape === 'code' || etape === 'signer') && etatMandat(recherche) !== 'valide') {
      const doc = await mandatDocumentEnRoute(sb, recherche.id, adressesClient(client));
      if (doc) return ko('document', 409, { lien: doc.lien });
    }

    switch (etape) {

      /* ── il ouvre le parcours ─────────────────────────────── */
      case 'afficher': {
        if (etatMandat(recherche) === 'valide') return NextResponse.json({ ok: true, etat: 'valide' });
        /* Une ligne par demi-heure : il peut ouvrir, fermer, rouvrir. */
        const ilYA30 = new Date(Date.now() - 30 * 60_000).toISOString();
        const { data: deja } = await sb.from('espace_evenements').select('id')
          .eq('recherche_id', recherche.id).eq('type', 'mandat').gte('created_at', ilYA30).limit(1).maybeSingle();
        if (!deja) await evt('mandat', 'Mandat de recherche affiché');
        /* La version du jour : si Alexandre a changé le taux depuis que la
           page est ouverte, l'écran se met à jour avant que le client lise.
           L'identité de l'agence aussi (Paramètres › Agence) : le client lit
           celle qui sera imprimée. */
        return NextResponse.json({ ok: true, recherche: rechercheDepuis(recherche), identite: await lireIdentiteAgence(sb) });
      }

      /* ── ses coordonnées, puis le code ─────────────────────── */
      case 'code': {
        if (etatMandat(recherche) === 'valide') return ko('deja', 409);
        const actuelle = rechercheDepuis(recherche);
        if (body.version !== versionMandat(actuelle)) return ko('change', 409, { recherche: actuelle });
        const v = validerMandant(body.mandant);
        if (!v.ok) return ko('coordonnees', 400, { champs: v.champs });
        const mandant = v.mandant;

        /* Ceux qui signent avec lui, ou la société qu'il représente. */
        const brutsCo: unknown[] = Array.isArray(body.cosignataires) ? body.cosignataires : [];
        if (brutsCo.length > COSIGNATAIRES_MAX) return ko('coordonnees', 400, { champs: { cosignataires: `${COSIGNATAIRES_MAX} personnes au plus avec vous` } });
        const cosV: Mandant[] = [];
        for (let i = 0; i < brutsCo.length; i++) {
          const vc = validerPersonne(brutsCo[i], [mandant.email, ...cosV.map(c => c.email)]);
          if (!vc.ok) return ko('coordonnees', 400, { co: i, champs: vc.champs });
          cosV.push(vc.mandant);
        }
        let societe: Societe | null = null;
        if (body.societe && !cosV.length) {
          const vs = validerSociete(body.societe);
          if (!vs.ok) return ko('coordonnees', 400, { societe: true, champs: vs.champs });
          societe = vs.societe;
        }
        const kbis = societe ? lireKbis(body.kbis) : null;
        if (societe && body.kbis && !kbis) return ko('kbis', 400);

        const avant = await derniere(sb, recherche.id);
        const reprise = avant && avant.statut === 'en_cours' ? avant : null;
        if (reprise?.code_envoye_le && Date.now() - Date.parse(reprise.code_envoye_le) < ECART_ENVOIS_S * 1000) {
          return ko('attendre', 429, { secondes: ECART_ENVOIS_S });
        }
        /* Six codes au plus d'affilée ; une heure sans en demander, et le
           compteur repart (avant, il restait bloqué pour toujours). */
        const remise = !reprise?.code_envoye_le || Date.now() - Date.parse(reprise.code_envoye_le) > 3_600_000;
        if (reprise && !remise && reprise.codes_envoyes >= CODES_MAX) return ko('quota', 429);

        /* Le numéro : celui de la ligne en cours, sinon celui qu'Alexandre a
           préparé, sinon le premier de sa réserve. Il est posé AVANT la
           signature, comme l'exige le registre. */
        const reserve = await lireReserve(sb);
        let numero = reprise?.numero || (typeof recherche.mandat_numero === 'string' && recherche.mandat_numero.trim()) || '';
        let agenceLe: string | null = reprise?.contenu?.agenceLe
          ?? (recherche.mandat_numero ? (recherche.mandat_propose_le || reserve.approuveLe || null) : null);
        let source = reprise?.contenu?.source || (recherche.mandat_numero ? 'prepare' : '');
        let idLigne: string = reprise?.id || randomUUID();
        /* Le registre démarré mais illisible : on ne se rabat pas sur la
           réserve (deux numérotations), il réessaiera dans un instant. */
        if (!reprise && reserve.registreKo) {
          console.error('[registre] lecture impossible', reserve.registreKo);
          return ko('numero', 409);
        }
        /* Le registre des mandats du CRM (V3.18) : le numéro est pris
           maintenant, avant la signature — il figure sur son exemplaire.
           Seul un numéro d'avant le registre (réservé dans l'ancien) reste
           tel quel ; un numéro déjà sur la fiche est celui d'une signature
           commencée (le registre rend alors la même ligne) ou d'un mandat
           fini (il en donne un nouveau). */
        if (!reprise && reserve.registre && !(numero && numeroAncien(numero, reserve.premier))) {
          const accordLe = (typeof recherche.mandat_propose_le === 'string' && recherche.mandat_propose_le) || reserve.approuveLe;
          if (!accordLe) return ko('numero', 409);
          const entree = {
            nature: 'recherche' as const, type_mandat: 'simple', source: 'espace' as const,
            mandants: mandantsRegistre(mandant, cosV, societe), objet: `Recherche : ${decrireRecherche(actuelle)}`,
            client_id: recherche.client_id, recherche_id: recherche.id,
          };
          let lr: LigneRegistre;
          try {
            lr = await inscrire(sb, { ...entree, signature_id: idLigne });
            /* Une signature commencée plus tôt (la ligne de mandat n'avait pas
               pu être écrite) : on reprend son identifiant, pour que « Signé »
               et « Rétracté » retrouvent la ligne du registre. S'il est déjà
               pris par une autre ligne de mandat, cette réservation est close
               « sans suite » et un nouveau numéro est pris. */
            if (lr.signature_id && lr.signature_id !== idLigne) {
              const { data: pris, error: ePris } = await sb.from('mandats_signatures').select('id, statut').eq('id', lr.signature_id).maybeSingle();
              if (ePris) throw new Error(ePris.message);
              /* Deux demandes au même instant (deux onglets) : la première
                 est en cours d'écriture ; celle-ci attend et la reprendra. */
              if (pris?.statut === 'en_cours') return ko('attendre', 429, { secondes: ECART_ENVOIS_S });
              if (!pris) idLigne = lr.signature_id;
              else {
                const pb = await observer(sb, { registre_id: lr.id, type: 'sans_suite', texte: `Signature commencée dans l’espace le ${dateCourte(lr.inscrit_le)}, jamais menée à son terme : numéro laissé, un nouveau est pris.` });
                if (pb) throw new Error(pb);
                lr = await inscrire(sb, { ...entree, signature_id: idLigne });
                if (lr.signature_id !== idLigne) throw new Error('la ligne du registre ne correspond pas');
              }
            }
          } catch (e) {
            console.error('[registre] inscription depuis l’espace', (e as Error).message);
            return ko('numero', 409);
          }
          const nouveau = String(lr.numero) !== numero;
          numero = String(lr.numero); agenceLe = accordLe; source = 'registre';
          if (nouveau) {
          const { error: eNum } = await sb.from('recherches').update({ mandat_numero: numero, mandat_type: 'simple' }).eq('id', recherche.id);
          await ecritServeur('L’historique du client', sb.from('journal').insert({
            client_id: recherche.client_id, recherche_id: recherche.id, type: 'mandat',
            titre: `🔢 N° ${numero} inscrit au registre, signature en cours`,
            description: 'Pris dans le registre des mandats du CRM quand il a demandé son code. S’il ne va pas au bout, marque-le « sans suite » dans le registre.',
            metadata: { numero },
          }));
          if (eNum || await alerteMailActive(sb, 'mandat_numero')) await envoyerMail({
            a: ALERTES(), deLaPartDe: 'crm',
            sujet: `N° ${numero} inscrit au registre pour ${nomClient} (signature en cours)`,
            texte: `Le numéro ${numero} du registre des mandats vient d'être inscrit pour le mandat de recherche de ${nomClient}, qui est en train de le signer depuis son espace. Rien à reporter ailleurs. S'il ne signe pas, marque-le « sans suite » dans Documents › Registre des mandats.${eNum ? `\n\n⚠️ La fiche n'a pas pu garder le numéro : ${eNum.message}` : ''}\n\n${lienCrm}`,
            html: gabarit(`N° ${numero} inscrit au registre`,
              `<p>Le numéro <b>${echappe(numero)}</b> du registre des mandats vient d'être inscrit pour le mandat de recherche de <b>${echappe(nomClient)}</b>, qui est en train de le signer depuis son espace.</p>
               <p>Rien à reporter ailleurs. S'il ne signe pas, marque-le « sans suite » dans Documents › Registre des mandats.</p>
               ${eNum ? `<p style="color:#b91c1c">⚠️ La fiche n'a pas pu garder le numéro : ${echappe(eNum.message)}</p>` : ''}
               <a href="${lienCrm}" style="display:inline-block;margin-top:8px;background:#c9a84c;color:#1a2332;text-decoration:none;padding:11px 16px;border-radius:10px;font-weight:800">Ouvrir sa fiche</a>`),
          });
          }
        }
        if (!numero) {
          const pris = await prendreNumero(sb);
          if (!pris) return ko('numero', 409);
          numero = pris.numero; agenceLe = pris.approuveLe; source = 'reserve';
          const { error: eNum } = await sb.from('recherches').update({ mandat_numero: numero, mandat_type: 'simple' }).eq('id', recherche.id);
          /* Le registre avant tout : Alexandre doit reporter ce numéro dans
             ImmoFacile, avec la date d'aujourd'hui. */
          const reste = pris.restants <= RESERVE_ALERTE
            ? `<p style="color:#b45309"><b>Il ne te reste que ${pris.restants} numéro${pris.restants > 1 ? 's' : ''} d'avance.</b> Pense à en réserver d'autres dans ImmoFacile et à les ajouter dans le CRM.</p>` : '';
          /* Une trace dans son suivi : si l'alerte mail est coupée (Paramètres
             → Alertes mail), c'est là qu'Alexandre voit qu'un numéro de sa
             réserve est parti. Le mail, lui, part quand même s'il y a un
             problème à régler : fiche pas à jour, réserve presque vide. */
          const { error: eJN } = await sb.from('journal').insert({
            client_id: recherche.client_id, recherche_id: recherche.id, type: 'mandat',
            titre: `🔢 N° ${numero} attribué, signature en cours`,
            description: `Pris dans ta réserve. À reporter dans le registre ImmoFacile ; s'il ne va pas au bout, le marquer « clos sans suite ».`,
            metadata: { numero },
          });
          if (eJN) console.error('[mandat] numéro attribué, journal', eJN.message);
          if (eNum || pris.restants <= RESERVE_ALERTE || await alerteMailActive(sb, 'mandat_numero')) await envoyerMail({
            a: ALERTES(), deLaPartDe: 'crm',
            sujet: `N° ${numero} attribué à ${nomClient} (signature en cours)`,
            texte: `Le numéro ${numero} de ta réserve vient d'être attribué au mandat de recherche de ${nomClient}, qui est en train de le signer depuis son espace. Reporte-le dans le registre ImmoFacile. S'il ne signe pas, marque-le « clos sans suite ».${eNum ? `\n\n⚠️ La fiche n'a pas pu garder le numéro : ${eNum.message}` : ''}\n\n${lienCrm}`,
            html: gabarit(`N° ${numero} attribué à ${nomClient}`,
              `<p>Le numéro <b>${echappe(numero)}</b> de ta réserve vient d'être attribué au mandat de recherche de <b>${echappe(nomClient)}</b>, qui est en train de le signer depuis son espace.</p>
               <p><b>Reporte-le dans le registre ImmoFacile.</b> S'il ne va pas au bout, marque-le « clos sans suite ».</p>${reste}
               ${eNum ? `<p style="color:#b91c1c">⚠️ La fiche n'a pas pu garder le numéro : ${echappe(eNum.message)}</p>` : ''}
               <a href="${lienCrm}" style="display:inline-block;margin-top:8px;background:#c9a84c;color:#1a2332;text-decoration:none;padding:11px 16px;border-radius:10px;font-weight:800">Ouvrir sa fiche</a>`),
          });
        }

        /* Pas d'offre de l'agence, pas de signature : le client ne peut signer
           qu'un mandat qu'Alexandre a déjà accepté (« Proposer au client »,
           ou son approbation du mandat type pour la réserve). */
        if (!agenceLe) return ko('numero', 409);

        const maintenant = new Date().toISOString();
        const id = idLigne;
        const deroule = [...(reprise?.deroule || [])];
        if (!reprise) {
          const { data: vu } = await sb.from('espace_evenements').select('created_at')
            .eq('recherche_id', recherche.id).eq('type', 'mandat').order('created_at', { ascending: false }).limit(1).maybeSingle();
          if (vu?.created_at) deroule.push({ t: vu.created_at, x: 'Mandat affiché dans son espace personnel, récapitulatif lu' });
          deroule.push({ t: maintenant, x: body.certifie === true
            ? (cosV.length || societe
              ? 'Coordonnées confirmées et certifiées exactes et complètes par le signataire'
              : 'Coordonnées confirmées et certifiées exactes par le signataire (« ce sont les miennes, le mandat est établi à mon nom »)')
            : 'Coordonnées confirmées par le signataire' });
        }
        if (cosV.length) deroule.push({ t: maintenant, x: `${cosV.length > 1 ? 'Co-signataires indiqués' : 'Co-signataire indiqué'} et informations certifiées exactes par le signataire : ${cosV.map(c => `${nomDe(c)} (${c.email})`).join(', ')}` });
        if (societe) deroule.push({ t: maintenant, x: `Achat via la société ${societe.denomination} (SIREN ${societe.siren}) ; habilitation à l’engager certifiée par le signataire${kbis ? ', Kbis joint' : ''}` });
        deroule.push({ t: maintenant, x: `${reprise ? 'Nouveau code' : 'Code à 6 chiffres'} envoyé à ${mandant.email}` });

        /* Le Kbis, s'il en a joint un : rangé avant la ligne, qui garde son chemin. */
        let kbisChemin: string | null = null;
        if (kbis) {
          const c = `${recherche.id}/kbis-${Date.now()}.${kbis.ext}`;
          const up = await sb.storage.from(BUCKET).upload(c, kbis.octets, { contentType: kbis.type, upsert: false });
          if (up.error) return ko('stockage', 500, { detail: up.error.message });
          kbisChemin = c;
        }

        const code = String(randomInt(0, 1_000_000)).padStart(6, '0');
        const ligne = {
          id, recherche_id: recherche.id, client_id: recherche.client_id, numero, type: 'simple', statut: 'en_cours',
          mandant, contenu: { ...figerContenu(actuelle), agenceLe, source },
          code_hash: hacher(code, id), code_expire_le: new Date(Date.now() + CODE_MINUTES * 60_000).toISOString(),
          code_essais: 0, codes_envoyes: remise ? 1 : (reprise?.codes_envoyes || 0) + 1, code_envoye_le: maintenant, deroule,
          /* La société : écrite seulement si elle existe ou si la colonne est
             là (le SQL lancé) — sinon, un client qui signe seul ne doit pas
             buter sur une colonne manquante. */
          ...(societe || (reprise && 'societe' in reprise) ? { societe } : {}),
          ...(kbisChemin ? { kbis_chemin: kbisChemin } : {}),
        };
        const { error } = reprise
          ? await sb.from('mandats_signatures').update(ligne).eq('id', id)
          : await sb.from('mandats_signatures').insert(ligne);
        if (error) return ko('enregistrement', 500, { detail: error.message });

        /* Ses co-signataires : remplacés à chaque demande de code (il a pu
           revenir en arrière et changer d'avis). */
        if (reprise) {
          const { error: eDel } = await sb.from('mandats_cosignataires').delete().eq('signature_id', id).eq('statut', 'prevu');
          /* Seule excuse : la table n'existe pas (SQL pas lancé). Sinon, un
             ancien co-signataire retiré recevrait quand même l'invitation. */
          if (eDel && (cosV.length || !/does not exist|schema cache/i.test(eDel.message || ''))) return ko('enregistrement', 500, { detail: eDel.message });
        }
        if (cosV.length) {
          const { error: eCo } = await sb.from('mandats_cosignataires').insert(cosV.map((c, i) => ({
            signature_id: id, recherche_id: recherche.id, rang: i + 2, statut: 'prevu', saisi: c, personne: c, deroule: [],
          })));
          if (eCo) return ko('enregistrement', 500, { detail: eCo.message });
        }

        const joli = `${code.slice(0, 3)} ${code.slice(3)}`;
        const eMail = await envoyerMail({
          a: mandant.email, nomA: `${mandant.prenom} ${mandant.nom}`, deLaPartDe: 'agence',
          sujet: `Votre code de signature : ${code}`,
          texte: `Bonjour ${mandant.prenom},\n\nVoici votre code pour signer votre mandat de recherche : ${joli}\n\nIl est valable ${CODE_MINUTES} minutes.\n\nSi vous n'êtes pas à l'origine de cette demande, ignorez simplement ce message.\n\nAlexandre Rogelet — Emilio Immobilier`,
          html: gabarit('Votre code de signature', `<p>Bonjour ${echappe(mandant.prenom)},</p>
            <p>Voici votre code pour signer votre mandat de recherche :</p>
            <div style="margin:16px 0;font-size:32px;font-weight:800;letter-spacing:8px;color:#1a2332">${joli}</div>
            <p>Il est valable ${CODE_MINUTES} minutes.</p>`,
            'Si vous n’êtes pas à l’origine de cette demande, ignorez simplement ce message.'),
        });
        if (eMail) return ko('mail', 502);
        return NextResponse.json({ ok: true, email: masquerEmail(mandant.email), numero });
      }

      /* ── la signature ─────────────────────────────────────── */
      case 'signer': {
        const code = String(body.code || '').replace(/\D/g, '');
        if (code.length !== 6) return ko('code', 400);
        if (body.accepte !== true) return ko('accepte', 400);
        if (typeof body.execution !== 'boolean') return ko('execution', 400);
        const execution = body.execution as boolean;

        const l = await derniere(sb, recherche.id);
        if (!l) return ko('recommencer', 409);
        if (l.statut === 'signe') return NextResponse.json({ ok: true, deja: true, numero: l.numero });
        if (l.statut !== 'en_cours' || !l.code_hash) return ko('recommencer', 409);
        /* Le taux ou les critères ont changé depuis l'envoi du code : ce qu'il
           a lu n'est plus ce que la fiche dit. Il relit, puis redemande un
           code (qui refige le contenu). Aucun essai n'est décompté. */
        const actuelle = rechercheDepuis(recherche);
        if (versionMandat(l.contenu.recherche) !== versionMandat(actuelle)) return ko('change', 409, { recherche: actuelle });
        if (l.code_essais >= CODE_ESSAIS) return ko('trop', 429);
        if (!l.code_expire_le || Date.parse(l.code_expire_le) < Date.now()) return ko('expire', 410);
        if (!egal(hacher(code, l.id), l.code_hash)) {
          const essais = l.code_essais + 1;
          await ecritServeur('Le compte des essais du code', sb.from('mandats_signatures').update({ code_essais: essais }).eq('id', l.id));
          return ko('code', 400, { restants: Math.max(0, CODE_ESSAIS - essais) });
        }

        /* ── le code est bon : on signe ── */
        const le = new Date().toISOString();
        const ip = (req.headers.get('x-forwarded-for') || req.headers.get('x-real-ip') || '').split(',')[0].trim();
        const appareil = appareilDe(req.headers.get('user-agent') || '');
        const m = l.mandant;
        const nom = `${m.prenom} ${m.nom}`.trim();
        const tentative = l.code_essais === 0 ? '1re tentative' : `${l.code_essais + 1}e tentative`;
        /* La signature tracée au doigt par le client (PNG en data URL). Elle
           rejoint sa case sur le PDF. Facultative ici : un espace resté ouvert
           avant la mise à jour signe encore par le seul code. */
        let griffeMandant: Uint8Array | null = null;
        if (typeof body.griffe === 'string' && body.griffe.startsWith('data:image/png;base64,') && body.griffe.length < 600_000) {
          const o = Buffer.from(body.griffe.slice(22), 'base64');
          if (o.length > 200 && o[0] === 0x89 && o[1] === 0x50 && o[2] === 0x4e && o[3] === 0x47) griffeMandant = new Uint8Array(o);
        }
        const deroule = [...(l.deroule || []),
          ...(griffeMandant ? [{ t: le, x: 'Signature tracée à la main sur l’écran par le signataire' }] : []),
          { t: le, x: `Code saisi et validé (${tentative})` },
          { t: le, x: `Cases cochées : « J’ai lu mon mandat de recherche et je l’accepte » · « ${execution
            ? 'Je demande que la recherche commence tout de suite, sans attendre la fin de mon délai de rétractation'
            : 'Je préfère que la recherche commence à la fin de mon délai de rétractation'} »` },
        ];

        /* ── À plusieurs : il signe en premier ──
           Son conjoint, ses co-acquéreurs reçoivent ensuite chacun leur lien.
           Le mandat l'engage dès maintenant (le texte le dit) : la fiche se
           remplit comme s'il signait seul, et ses visites peuvent partir. */
        const cos = (await lireCos(sb, l.id)).filter(c => c.statut === 'prevu');
        if (cos.length) {
          const contenu = l.contenu;
          const identite = await lireIdentiteAgence(sb);
          const griffeChemin = await rangerGriffe(sb, recherche.id, l.numero, '1', griffeMandant);
          const lp: LigneMandat = {
            ...(l as unknown as LigneMandat), recherche_id: recherche.id, client_id: recherche.client_id,
            statut: 'partiel', signe_le: le, ip, appareil, execution_immediate: execution, email_verifie: m.email,
            deroule, contenu: { ...l.contenu, identite }, griffe_chemin: griffeChemin, empreinte: null, societe: null,
          };
          /* Leurs liens sont préparés avant le PDF, qui les dit « en attente ». */
          const prets: Co[] = cos.map(c => ({ ...c, ...lienNeuf(c, le) }) as Co);
          const sc = await sceller(sb, lp, prets);
          if (!sc.ok) return ko('stockage', 500, { detail: sc.erreur });
          const { error: eLigne } = await sb.from('mandats_signatures').update({
            statut: 'partiel', signe_le: le, ip, appareil, execution_immediate: execution, email_verifie: m.email,
            code_hash: null, code_essais: l.code_essais + 1, deroule, griffe_chemin: griffeChemin, ...sc.maj,
          }).eq('id', l.id);
          if (eLigne) return ko('enregistrement', 500, { detail: eLigne.message });
          /* Le registre (V3.18) : signé, et qui doit encore signer. */
          const pbRegP = await observer(sb, { signature_id: l.id, numeroSinon: l.contenu?.source === 'registre' ? l.numero : null, type: 'signe',
            texte: `Signé en ligne depuis son espace par ${nomDe(m)}, le ${dateCourte(le)} à ${heureParis(le)} ; co-signature attendue de ${cos.map(c => nomDe(c.personne)).join(', ')}.` });
          await alerteRegistre(pbRegP, l.numero, 'Signé (co-signature attendue)');
          const echecs: string[] = [];
          for (const c of prets) {
            const { error: eC } = await sb.from('mandats_cosignataires').update({
              statut: c.statut, jeton: c.jeton, invite_le: c.invite_le, lien_expire_le: c.lien_expire_le,
              relances: 0, relance_le: null, deroule: c.deroule,
            }).eq('id', c.id);
            const eM = eC ? eC.message : await envoyerLien(c, lp);
            if (eM) echecs.push(`${nomDe(c.personne)} : ${eM}`);
          }

          const jourP = jourParis(le);
          const finP = new Date(Date.parse(jourP + 'T12:00:00Z') + DUREE.total * 86_400_000).toISOString().slice(0, 10);
          const { error: eFicheP } = await sb.from('recherches').update({
            mandat_date_signature: jourP, mandat_duree: 12, mandat_honoraires: honorairesCourt(contenu),
            mandat_date_expiration: finP, sans_mandat: false, mandat_numero: l.numero, mandat_type: 'simple',
            updated_at: new Date().toISOString(),
          }).eq('id', recherche.id);

          /* La fiche passe en couple avec la personne qu'il a ajoutée (la
             première, s'il en a mis plusieurs). Alexandre le voit. */
          const netP = (t: unknown) => String(t || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z@.0-9]/g, '');
          const conj = cos[0].personne;
          let fiche = '';
          if ('couple' in client) {
            const lite = { civilite: conj.civilite, prenom: conj.prenom, nom: conj.nom, email: conj.email, telephone: conj.telephone, naissanceDate: conj.naissanceDate, naissanceLieu: conj.naissanceLieu };
            if (!client.couple) {
              const { error: eC } = await sb.from('clients').update({ couple: true, conjoint: lite, ...(client.civilite ? {} : { civilite: m.civilite }) }).eq('id', client.id);
              fiche = eC ? `La fiche n'a pas pu passer en couple (${eC.message}).` : `La fiche passe en couple : ${nomDe(conj)} a été ajouté${conj.civilite === 'Madame' ? 'e' : ''} par ${m.prenom}.`;
            } else if (netP(client.conjoint?.email) !== netP(conj.email) || netP(client.conjoint?.nom) !== netP(conj.nom)) {
              fiche = `${m.prenom} a indiqué ${nomDe(conj)} (${conj.email}) ; ta fiche indique ${[client.conjoint?.prenom, client.conjoint?.nom].filter(Boolean).join(' ') || 'une autre personne'}.`;
            }
          }
          const autres = cos.map(c => nomDe(c.personne)).join(' et ');
          const { error: eJP } = await sb.from('journal').insert({
            client_id: recherche.client_id, recherche_id: recherche.id, type: 'mandat',
            titre: `✍️ Mandat signé en ligne par ${m.prenom}, en attente de ${cos.map(c => c.personne.prenom).join(' et ')}`,
            description: `n° ${l.numero} · ${honorairesCourt(contenu)} · ${execution ? 'recherche lancée tout de suite' : 'recherche après les 14 jours'}\nLien personnel envoyé à ${cos.map(c => `${nomDe(c.personne)} (${c.personne.email})`).join(', ')}${fiche ? `\n👥 ${fiche}` : ''}${echecs.length ? `\n⚠️ Lien non envoyé : ${echecs.join(' ; ')}` : ''}`,
            metadata: { signature_id: l.id, numero: l.numero, empreinte: sc.empreinte },
          });
          if (eJP) console.error('[mandat] journal', eJP.message);
          await evt('mandat', `Mandat n° ${l.numero} signé, en attente de ${autres}`);

          const eP = await envoyerExemplaire({ a: m, numero: l.numero, signe: sc.signe, complet: false, fin: null, attendus: cos.map(c => c.personne.prenom) });
          const pjP = [{ nom: `Mandat-de-recherche-${l.numero}.pdf`, type: 'application/pdf', base64: Buffer.from(sc.signe).toString('base64') }];
          if (eP || eFicheP || echecs.length || fiche || await alerteMailActive(sb, 'mandat_signe')) await envoyerMail({
            a: ALERTES(), deLaPartDe: 'crm', pj: pjP,
            sujet: `✍️ ${nom} a signé son mandat (n° ${l.numero}) · en attente de ${autres}`,
            texte: `${nom} vient de signer son mandat de recherche n° ${l.numero} depuis son espace, le ${dateCourte(le)} à ${heureParis(le)}.\nIl signe avec ${autres}, qui ${cos.length > 1 ? 'ont' : 'a'} reçu son lien personnel. Le mandat l'engage déjà ; il sera complet à leur signature.\n${execution ? 'Il a demandé que la recherche commence tout de suite.' : 'Il préfère attendre la fin des 14 jours.'}${contenu.source === 'reserve' ? '\nNuméro pris dans ta réserve : reporte-le dans ImmoFacile.' : ''}${fiche ? `\n👥 ${fiche}` : ''}${echecs.length ? `\n⚠️ Lien non envoyé : ${echecs.join(' ; ')}. Renvoie-le depuis sa fiche.` : ''}${eP ? `\n⚠️ Sa copie n'a pas pu lui être envoyée (${eP}).` : ''}${eFicheP ? `\n⚠️ La fiche n'a pas pu être mise à jour (${eFicheP.message}).` : ''}\n\n${lienCrm}`,
            html: gabarit(`${nom} a signé son mandat`, `<p><b>${echappe(nom)}</b> vient de signer son mandat de recherche <b>n° ${echappe(l.numero)}</b> depuis son espace, le ${dateCourte(le)} à ${heureParis(le)}.</p>
              <p>Il signe avec <b>${echappe(autres)}</b>, qui ${cos.length > 1 ? 'ont' : 'a'} reçu son lien personnel. Le mandat l’engage déjà ; il sera complet à leur signature.</p>
              <p>${execution ? 'Il a demandé que la recherche commence <b>tout de suite</b>.' : 'Il préfère attendre la fin des 14 jours.'}</p>
              ${contenu.source === 'reserve' ? '<p>Numéro pris dans ta réserve : <b>reporte-le dans ImmoFacile</b>.</p>' : ''}
              ${fiche ? `<p style="color:#1e3a8a">👥 ${echappe(fiche)}</p>` : ''}
              ${echecs.length ? `<p style="color:#b91c1c">⚠️ Lien non envoyé : ${echappe(echecs.join(' ; '))}. Renvoie-le depuis sa fiche.</p>` : ''}
              ${eP ? `<p style="color:#b91c1c">⚠️ Sa copie n’a pas pu lui être envoyée (${echappe(eP)}).</p>` : ''}
              ${eFicheP ? `<p style="color:#b91c1c">⚠️ La fiche n’a pas pu être mise à jour (${echappe(eFicheP.message)}).</p>` : ''}
              <a href="${lienCrm}" style="display:inline-block;margin-top:8px;background:#c9a84c;color:#1a2332;text-decoration:none;padding:11px 16px;border-radius:10px;font-weight:800">Ouvrir sa fiche</a>`),
          });
          const finR = finRetractation(le);
          return NextResponse.json({
            ok: true, numero: l.numero, signeLe: le, finRetractation: finR.toISOString(), execution,
            attente: prets.map(c => ({ id: c.id, prenom: c.personne.prenom, nom: c.personne.nom, email: masquerEmail(c.personne.email), envoye: !echecs.some(e => e.startsWith(nomDe(c.personne))) })),
          });
        }

        /* La signature manuscrite d'Alexandre, si elle est déposée. */
        let griffe: Uint8Array | null = null;
        try {
          const { data: f } = await sb.storage.from(BUCKET).download(SIGNATURE_AGENCE);
          if (f) griffe = new Uint8Array(await f.arrayBuffer());
        } catch { griffe = null; }

        const contenu = l.contenu;
        /* L'identité de l'agence du jour de la signature. Elle est gardée
           avec le mandat : ce qui est signé ne bouge plus. */
        const identite = await lireIdentiteAgence(sb);
        /* Via une société : c'est elle, représentée par lui, qui est nommée
           sur le PDF ; les mails, eux, restent adressés à la personne. */
        const soc = l.societe || null;
        const nomPdf = soc ? `${soc.denomination.toUpperCase()}, représentée par ${nom}` : nom;
        const parties = redigerMandat({
          numero: l.numero, mandant: m, recherche: contenu.recherche, executionImmediate: execution,
          signature: { le, email: m.email }, ...(soc ? { societe: soc } : {}),
        }, identite);
        const sig = { mandantNom: nomPdf, le, email: m.email, agenceLe: contenu.agenceLe || null };
        const fabriquer = (certif: number) => pdfMandat(parties, {
          numero: l.numero, mandantNom: nomPdf, resume: resumeMandat(contenu.recherche), sig,
          pagesEnTout: n => n + certif, signatureAgence: griffe, signatureMandant: griffeMandant, identite,
        });
        const certifier = (s1: Uint8Array, e1: string) => pdfSigne(s1, {
          numero: l.numero, mandant: { nom: nomPdf, adresse: soc ? soc.siege : m.adresse, email: m.email, telephone: m.telephone },
          signeLe: le, ip, appareil, empreinte: e1, deroule, executionImmediate: execution, agenceLe: contenu.agenceLe || null,
          identite,
        });
        let seul = await fabriquer(1);
        let empreinte = createHash('sha256').update(seul).digest('hex');
        let signe = await certifier(seul, empreinte);
        /* Un certificat qui déborde sur une 2e page (long déroulé, société) :
           le pied « 3 / 8 » du mandat doit le savoir. On refait avec le bon
           compte — une seule page, et rien ne change. */
        const nbCertif = (await PDFDocument.load(signe)).getPageCount() - (await PDFDocument.load(seul)).getPageCount();
        if (nbCertif !== 1) {
          seul = await fabriquer(nbCertif);
          empreinte = createHash('sha256').update(seul).digest('hex');
          signe = await certifier(seul, empreinte);
        }

        const racine = `${recherche.id}/${l.numero}-${Date.now()}`;
        const cheminSeul = `${racine}-mandat.pdf`, cheminSigne = `${racine}-signe.pdf`;
        const up1 = await sb.storage.from(BUCKET).upload(cheminSeul, seul, { contentType: 'application/pdf', upsert: false });
        if (up1.error) return ko('stockage', 500, { detail: up1.error.message });
        const up2 = await sb.storage.from(BUCKET).upload(cheminSigne, signe, { contentType: 'application/pdf', upsert: false });
        if (up2.error) return ko('stockage', 500, { detail: up2.error.message });

        const { error: eLigne } = await sb.from('mandats_signatures').update({
          statut: 'signe', signe_le: le, ip, appareil, empreinte, execution_immediate: execution,
          email_verifie: m.email, pdf_chemin: cheminSigne, pdf_mandat_chemin: cheminSeul,
          code_hash: null, code_essais: l.code_essais + 1, deroule,
          contenu: { ...contenu, identite },
        }).eq('id', l.id);
        if (eLigne) return ko('enregistrement', 500, { detail: eLigne.message });
        /* Le registre (V3.18) : « Signé » sur sa ligne. */
        const pbReg = await observer(sb, { signature_id: l.id, numeroSinon: l.contenu?.source === 'registre' ? l.numero : null, type: 'signe', texte: `Signé en ligne depuis son espace par ${nomDe(m)}, le ${dateCourte(le)} à ${heureParis(le)}.` });
        await alerteRegistre(pbReg, l.numero, 'Signé');

        /* La fiche du CRM se remplit toute seule : le bloc Mandat affiche la
           signature, et l'espace ne redemandera plus rien. */
        const jour = jourParis(le);
        const fin = new Date(Date.parse(jour + 'T12:00:00Z') + DUREE.total * 86_400_000).toISOString().slice(0, 10);
        const { error: eFiche } = await sb.from('recherches').update({
          mandat_date_signature: jour, mandat_duree: 12, mandat_honoraires: honorairesCourt(contenu),
          mandat_date_expiration: fin, sans_mandat: false, mandat_numero: l.numero, mandat_type: 'simple',
          updated_at: new Date().toISOString(),
        }).eq('id', recherche.id);

        /* Ce qu'il a corrigé par rapport à la fiche : une faute, un conjoint
           qui signe à sa place, une autre adresse e-mail. Alexandre le voit
           tout de suite. */
        const net = (t: unknown) => String(t || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z@.0-9]/g, '');
        const nomFiche = `${client.prenom || ''} ${client.nom || ''}`.trim();
        const mailsFiche: string[] = Array.isArray(client.emails) ? client.emails.map(net) : [];
        const ecarts = [
          ...(nomFiche && net(nomFiche) !== net(nom) ? [`Nom sur le mandat : ${nom} — sur ta fiche : ${nomFiche}`] : []),
          ...(mailsFiche.length && !mailsFiche.includes(net(m.email)) ? [`E-mail vérifié : ${m.email} — absent de ta fiche`] : []),
        ];
        await ecritServeur('L’historique du client', sb.from('journal').insert({
          client_id: recherche.client_id, recherche_id: recherche.id,
          type: 'mandat', titre: soc ? `✍️ Mandat signé en ligne par le client, pour la société ${soc.denomination}` : '✍️ Mandat signé en ligne par le client',
          description: `n° ${l.numero} · ${honorairesCourt(contenu)} · ${DUREE.mois} mois au plus, fin possible à tout moment · ${execution ? 'recherche lancée tout de suite' : 'recherche après les 14 jours'}${soc ? `\n🏢 ${soc.forme} ${soc.denomination} · SIREN ${soc.siren} · RCS ${soc.rcsVille} · ${soc.qualite}${l.kbis_chemin ? ' · Kbis joint' : ' · sans Kbis'}` : ''}${ecarts.length ? `\n⚠️ ${ecarts.join('\n⚠️ ')}` : ''}`,
          metadata: { signature_id: l.id, numero: l.numero, empreinte },
        }));
        await evt('mandat', `Mandat n° ${l.numero} signé`);

        /* Les copies : au client (son exemplaire sur support durable), et à
           Alexandre. Un échec d'envoi ne défait pas la signature. */
        const pj = [{ nom: `Mandat-de-recherche-${l.numero}.pdf`, type: 'application/pdf', base64: Buffer.from(signe).toString('base64') }];
        const limite = finRetractation(le);
        const eClient = await envoyerMail({
          a: m.email, nomA: nom, pj, repondreA: 'agence@emilio-immo.com',
          sujet: `Votre mandat de recherche n° ${l.numero}`,
          texte: `Bonjour ${m.prenom},\n\nMerci pour votre confiance. Vous trouverez ci-joint votre mandat de recherche n° ${l.numero}, signé le ${dateLongue(le)}, avec son certificat de signature.\n\nVous le retrouvez aussi à tout moment dans votre espace, rubrique « Ma recherche ».\n\nAlexandre travaille désormais pour vous : les biens hors marché de son réseau, chaque dossier vérifié avant toute offre, la négociation, et un suivi jusqu'à la signature chez le notaire.\n\nÀ très vite,\nAlexandre Rogelet — Emilio Immobilier\n\n—\nLe mandat joint rappelle votre délai de rétractation de ${RETRACTATION_JOURS} jours (jusqu'au ${dateLongue(limite)} inclus) et la façon de l'exercer.`,
          html: gabarit('Votre mandat de recherche', `<p>Bonjour ${echappe(m.prenom)},</p>
            <p>Merci pour votre confiance. Vous trouverez ci-joint votre <b>mandat de recherche n° ${echappe(l.numero)}</b>, signé le ${dateLongue(le)}, avec son certificat de signature.</p>
            <p>Vous le retrouvez aussi à tout moment dans votre espace, rubrique « Ma recherche ».</p>
            <p>Alexandre travaille désormais pour vous&nbsp;: les biens hors marché de son réseau, chaque dossier vérifié avant toute offre, la négociation, et un suivi jusqu’à la signature chez le notaire.</p>
            <p>À très vite,<br>Alexandre Rogelet — Emilio Immobilier</p>`,
            `Le mandat joint rappelle votre délai de rétractation de ${RETRACTATION_JOURS} jours (jusqu’au ${dateLongue(limite)} inclus) et la façon de l’exercer.`),
        });
        const prix = contenu.prixMax ? `${euros(contenu.prixMax)} hors honoraires` : 'selon son budget';
        /* Coupé dans les Paramètres, il part quand même s'il y a quelque
           chose à rattraper : copie du client, fiche, recherche hors mandat. */
        if (eClient || eFiche || ecarts.length || await alerteMailActive(sb, 'mandat_signe')) await envoyerMail({
          a: ALERTES(), deLaPartDe: 'crm', pj,
          sujet: `✍️ ${nom} a signé son mandat (n° ${l.numero})`,
          texte: `${nom} vient de signer son mandat de recherche n° ${l.numero} depuis son espace, le ${dateCourte(le)} à ${heureParis(le)}.\nPrix maximum : ${prix}. Honoraires : ${honorairesCourt(contenu)}.\n${execution ? 'Il a demandé que la recherche commence tout de suite.' : 'Il préfère attendre la fin de ses 14 jours : pas de visite avant le ' + dateCourte(limite) + '.'}\n${contenu.source === 'reserve' ? `\nNuméro pris dans ta réserve : reporte-le dans ImmoFacile.` : ''}${ecarts.map(e => `\n⚠️ ${e}`).join('')}${eClient ? `\n⚠️ Sa copie n'a pas pu lui être envoyée (${eClient}) : envoie-lui le PDF ci-joint.` : ''}${eFiche ? `\n⚠️ La fiche n'a pas pu être mise à jour (${eFiche.message}) : remplis le bloc Mandat à la main.` : ''}\n\n${lienCrm}`,
          html: gabarit(`${nom} a signé son mandat`, `<p><b>${echappe(nom)}</b> vient de signer son mandat de recherche <b>n° ${echappe(l.numero)}</b> depuis son espace, le ${dateCourte(le)} à ${heureParis(le)}.</p>
            <p>Prix maximum : ${echappe(prix)} · Honoraires : ${echappe(honorairesCourt(contenu))}</p>
            ${soc ? `<p>🏢 Pour la société <b>${echappe(soc.denomination)}</b> (${echappe(soc.forme)}, SIREN ${echappe(soc.siren)}, RCS ${echappe(soc.rcsVille)}), dont il est ${echappe(soc.qualite.toLowerCase())}${l.kbis_chemin ? ' · Kbis joint (dans le dossier privé)' : ' · pas de Kbis joint'}.</p>` : ''}
            <p>${execution ? 'Il a demandé que la recherche commence <b>tout de suite</b>.' : `Il préfère attendre la fin de ses 14 jours : <b>pas de visite avant le ${dateCourte(limite)}</b>.`}</p>
            ${contenu.source === 'reserve' ? '<p>Numéro pris dans ta réserve : <b>reporte-le dans ImmoFacile</b>.</p>' : ''}
            ${ecarts.map(e => `<p style="color:#b45309">⚠️ ${echappe(e)}</p>`).join('')}
            ${eClient ? `<p style="color:#b91c1c">⚠️ Sa copie n’a pas pu lui être envoyée (${echappe(eClient)}) : envoie-lui le PDF ci-joint.</p>` : ''}
            ${eFiche ? `<p style="color:#b91c1c">⚠️ La fiche n’a pas pu être mise à jour (${echappe(eFiche.message)}) : remplis le bloc Mandat à la main.</p>` : ''}
            <a href="${lienCrm}" style="display:inline-block;margin-top:8px;background:#c9a84c;color:#1a2332;text-decoration:none;padding:11px 16px;border-radius:10px;font-weight:800">Ouvrir sa fiche</a>`,
            'Le PDF signé, avec son certificat, est en pièce jointe et dans le dossier privé des mandats.'),
        });

        return NextResponse.json({ ok: true, numero: l.numero, signeLe: le, finRetractation: limite.toISOString(), execution });
      }

      /* ── son exemplaire ───────────────────────────────────── */
      case 'pdf': {
        const l = await derniere(sb, recherche.id);
        if (!l || !l.pdf_chemin || !['signe', 'retracte', 'partiel'].includes(l.statut)) return ko('aucun', 404);
        const { data, error } = await sb.storage.from(BUCKET)
          .createSignedUrl(l.pdf_chemin, 120, { download: `Mandat-de-recherche-${l.numero}.pdf` });
        if (error || !data?.signedUrl) return ko('stockage', 500);
        return NextResponse.json({ ok: true, url: data.signedUrl });
      }

      /* ── il renonce, dans les 14 jours ────────────────────── */
      case 'renoncer': {
        if (body.confirme !== true) return ko('confirmer', 400);
        const l = await derniere(sb, recherche.id);
        if (!l || !['signe', 'partiel'].includes(l.statut) || !l.signe_le) return ko('aucun', 404);
        /* À plusieurs, le délai court jusqu'à 14 jours après la dernière signature. */
        const cosR = await lireCos(sb, l.id);
        const finR = finRetractationDe(l, cosR) || finRetractation(l.signe_le);
        if (Date.now() > finR.getTime()) return ko('delai', 409);
        const le = new Date().toISOString();
        const { error } = await sb.from('mandats_signatures').update({
          statut: 'retracte', retracte_le: le,
          deroule: [...(l.deroule || []), { t: le, x: 'Rétractation exercée en ligne depuis son espace personnel' }],
        }).eq('id', l.id);
        if (error) return ko('enregistrement', 500, { detail: error.message });
        const pbRegR = await observer(sb, { signature_id: l.id, numeroSinon: l.contenu?.source === 'registre' ? l.numero : null, type: 'retracte', texte: `Rétractation exercée en ligne depuis son espace, le ${dateCourte(le)} à ${heureParis(le)}.` });
        await alerteRegistre(pbRegR, l.numero, 'Rétracté');
        /* Le premier signataire renonce : le mandat prend fin pour tous (le
           texte le prévoit). Ceux qu'on attendait ne le sont plus ; ceux qui
           avaient signé sont prévenus. */
        for (const c of cosR.filter(x => x.statut === 'invite' || x.statut === 'prevu')) {
          const { error: eC } = await sb.from('mandats_cosignataires').update({
            statut: 'annule', code_hash: null, deroule: [...(c.deroule || []), { t: le, x: `Invitation close : ${l.mandant.prenom} a renoncé au mandat` }],
          }).eq('id', c.id);
          if (eC) console.error('[mandat] renonciation, co-signataire', eC.message);
        }
        for (const c of cosR.filter(x => x.statut === 'signe')) {
          await envoyerMail({
            a: c.personne.email, nomA: nomDe(c.personne), repondreA: 'agence@emilio-immo.com',
            sujet: `Le mandat de recherche n° ${l.numero} a pris fin`,
            texte: `Bonjour ${c.personne.prenom},\n\n${l.mandant.prenom} a renoncé au mandat de recherche n° ${l.numero}, le ${dateLongue(le)} : il prend fin pour vous deux, sans aucun frais.\n\nSi vous souhaitez reprendre votre recherche avec nous, vous serez les bienvenus.\n\nAlexandre Rogelet — Emilio Immobilier`,
            html: gabarit('Le mandat a pris fin', `<p>Bonjour ${echappe(c.personne.prenom)},</p>
              <p>${echappe(l.mandant.prenom)} a renoncé au <b>mandat de recherche n° ${echappe(l.numero)}</b>, le ${dateLongue(le)} : il prend fin pour vous deux, sans aucun frais.</p>
              <p>Si vous souhaitez reprendre votre recherche avec nous, vous serez les bienvenus.</p>
              <p>Alexandre Rogelet — Emilio Immobilier</p>`),
          });
        }
        /* Le numéro reste attaché à ce mandat dans le registre : un nouveau
           mandat en prendra un autre. */
        const { error: eFiche } = await sb.from('recherches').update({
          mandat_date_signature: null, mandat_duree: null, mandat_honoraires: null, mandat_date_expiration: null,
          sans_mandat: true, mandat_numero: null, mandat_propose_le: null, updated_at: le,
          /* Le taux proposé part avec le mandat (la colonne peut manquer si
             le SQL n'a pas été lancé : on ne l'écrit que si elle existe). */
          ...('mandat_taux' in recherche ? { mandat_taux: null } : {}),
          ...('mandat_forfait' in recherche ? { mandat_forfait: null } : {}),
        }).eq('id', recherche.id);
        await ecritServeur('L’historique du client', sb.from('journal').insert({
          client_id: recherche.client_id, recherche_id: recherche.id, type: 'mandat',
          titre: '↩️ Le client a renoncé à son mandat (délai de rétractation)',
          description: `Mandat n° ${l.numero}, signé le ${dateCourte(l.signe_le)}, rétracté en ligne le ${dateCourte(le)} à ${heureParis(le)}.`,
          metadata: { signature_id: l.id, numero: l.numero },
        }));
        await evt('mandat', `Renonciation au mandat n° ${l.numero}`);
        /* Une relance du jour : elle sort en rouge dans Relances et sur le
           tableau de bord. Colonnes réelles : date_echeance / note / statut. */
        await ecritServeur('La relance', sb.from('relances').insert({
          client_id: recherche.client_id, recherche_id: recherche.id,
          type: 'rappel_client', statut: 'en_attente', date_echeance: le,
          note: `À rappeler : il a renoncé à son mandat de recherche n° ${l.numero} (délai de rétractation). Le noter dans le registre ImmoFacile.`,
        }));

        const m = l.mandant;
        /* L'accusé de réception, sur un support durable : la loi l'exige. */
        await envoyerMail({
          a: m.email, nomA: `${m.prenom} ${m.nom}`, repondreA: 'agence@emilio-immo.com',
          sujet: `Votre renonciation au mandat de recherche n° ${l.numero}`,
          texte: `Bonjour ${m.prenom},\n\nNous avons bien reçu votre renonciation au mandat de recherche n° ${l.numero}, le ${dateLongue(le)} à ${heureParis(le)}.\n\nLe mandat prend fin, sans aucun frais.\n\nSi vous souhaitez un jour reprendre votre recherche avec nous, vous serez le bienvenu.\n\nAlexandre Rogelet — Emilio Immobilier`,
          html: gabarit('Votre renonciation est enregistrée', `<p>Bonjour ${echappe(m.prenom)},</p>
            <p>Nous avons bien reçu votre renonciation au <b>mandat de recherche n° ${echappe(l.numero)}</b>, le ${dateLongue(le)} à ${heureParis(le)}.</p>
            <p>Le mandat prend fin, sans aucun frais.</p>
            <p>Si vous souhaitez un jour reprendre votre recherche avec nous, vous serez le bienvenu.</p>
            <p>Alexandre Rogelet — Emilio Immobilier</p>`,
            'Ce message vaut accusé de réception de votre rétractation.'),
        });
        if (eFiche || await alerteMailActive(sb, 'mandat_renonce')) await envoyerMail({
          a: ALERTES(), deLaPartDe: 'crm',
          sujet: `↩️ ${nomClient} a renoncé à son mandat (n° ${l.numero})`,
          texte: `${nomClient} a exercé son droit de rétractation en ligne, le ${dateCourte(le)} à ${heureParis(le)}. Le mandat n° ${l.numero} prend fin. Note-le dans le registre ImmoFacile.${eFiche ? `\n⚠️ La fiche n'a pas pu être mise à jour (${eFiche.message}).` : ''}\n\n${lienCrm}`,
          html: gabarit(`${nomClient} a renoncé à son mandat`, `<p><b>${echappe(nomClient)}</b> a exercé son droit de rétractation en ligne, le ${dateCourte(le)} à ${heureParis(le)}.</p>
            <p>Le mandat <b>n° ${echappe(l.numero)}</b> prend fin. Note-le dans le registre ImmoFacile.</p>
            ${eFiche ? `<p style="color:#b91c1c">⚠️ La fiche n’a pas pu être mise à jour (${echappe(eFiche.message)}).</p>` : ''}
            <a href="${lienCrm}" style="display:inline-block;margin-top:8px;background:#c9a84c;color:#1a2332;text-decoration:none;padding:11px 16px;border-radius:10px;font-weight:800">Ouvrir sa fiche</a>`),
        });
        return NextResponse.json({ ok: true });
      }

      /* ── à plusieurs : renvoyer son lien, corriger son adresse ── */
      case 'relancer':
      case 'corriger': {
        const l = await derniere(sb, recherche.id);
        if (!l || l.statut !== 'partiel') return ko('aucun', 404);
        const cosR = await lireCos(sb, l.id);
        const co = cosR.find(c => c.id === body.coId && c.statut === 'invite');
        if (!co) return ko('aucun', 404);
        const lp = l as unknown as LigneMandat;
        if (etape === 'relancer') {
          /* Un renvoi tous les quarts d'heure : un bouton pressé deux fois ne
             doit pas remplir sa messagerie. */
          if (co.relance_le && Date.now() - Date.parse(co.relance_le) < 15 * 60_000) return ko('attendre', 429);
          const r = await inviter(sb, co, lp, { note: `Lien renvoyé à la demande de ${l.mandant.prenom}` });
          if (r.erreur) return ko('mail', 502);
          await evt('mandat', `Lien renvoyé à ${nomDe(co.personne)}`);
          return NextResponse.json({ ok: true, expire: r.co.lien_expire_le, email: masquerEmail(r.co.personne.email) });
        }
        const email = String(body.email || '').replace(/\s+/g, '').toLowerCase().slice(0, 120);
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) return ko('email', 400);
        /* V3.33 : cinq corrections par jour au plus. Chacune envoie un mail
           neuf : sans limite, ce bouton pouvait servir à arroser n'importe
           quelle adresse depuis la nôtre. */
        {
          const depuis = new Date(Date.now() - 86_400_000).toISOString();
          const { count } = await sb.from('journal').select('id', { count: 'exact', head: true })
            .eq('recherche_id', recherche.id).eq('type', 'mandat').ilike('titre', '%corrigée par%').gte('created_at', depuis);
          if ((count || 0) >= 5) return ko('attendre', 429);
        }
        const pris = [l.mandant.email, ...cosR.filter(c => c.id !== co.id).map(c => c.personne.email)].map(x => String(x).toLowerCase());
        if (pris.includes(email)) return ko('email_pris', 400);
        const le = new Date().toISOString();
        const personne = { ...co.personne, email };
        const maj = { personne, ...lienNeuf({ ...co, personne }, le, `Adresse e-mail corrigée par ${l.mandant.prenom} (avant : ${co.personne.email})`) };
        const { data: neuf, error: eN } = await sb.from('mandats_cosignataires').update(maj).eq('id', co.id).select('*').single();
        if (eN || !neuf) return ko('enregistrement', 500, { detail: eN?.message });
        const eM = await envoyerLien(neuf as Co, lp);
        await ecritServeur('L’historique du client', sb.from('journal').insert({
          client_id: recherche.client_id, recherche_id: recherche.id, type: 'mandat',
          titre: `✉️ Adresse de ${co.personne.prenom} corrigée par ${l.mandant.prenom}`,
          description: `${co.personne.email} → ${email}. Un nouveau lien est parti${eM ? ` — ⚠️ le mail n'est pas parti (${eM})` : ''}, l'ancien ne fonctionne plus.`,
          metadata: { signature_id: l.id, cosignataire_id: co.id },
        }));
        if (eM) return ko('mail', 502);
        return NextResponse.json({ ok: true, email: masquerEmail(email), expire: (neuf as Co).lien_expire_le });
      }

      /* ── une question avant de signer ─────────────────────── */
      case 'question': {
        /* Une demande toutes les 12 heures suffit : un client qui reclique
           croit que la première n'est pas partie. */
        const depuis = new Date(Date.now() - 12 * 3_600_000).toISOString();
        const { count } = await sb.from('journal').select('id', { count: 'exact', head: true })
          .eq('recherche_id', recherche.id).eq('type', 'mandat').ilike('titre', '%question sur le mandat%')
          .gte('created_at', depuis);
        if ((count || 0) >= 1) return NextResponse.json({ ok: true, deja: true });

        let bienTitre = '';
        if (typeof body.bienId === 'string' && body.bienId.length < 80) {
          const { data: b } = await sb.from('biens').select('titre')
            .eq('id', body.bienId).eq('recherche_id', recherche.id).maybeSingle();
          bienTitre = b?.titre || '';
        }
        const actuelle = rechercheDepuis(recherche);
        const tel = Array.isArray(client.telephones) ? String(client.telephones[0] || '') : String(client.telephone || '');
        const quoi = bienTitre ? `avant de visiter « ${bienTitre} »` : 'avant de le signer';

        const { error: eJ } = await sb.from('journal').insert({
          client_id: recherche.client_id, recherche_id: recherche.id, type: 'mandat',
          titre: '📞 Une question sur le mandat, avant de signer',
          description: `Il souhaite être rappelé ${quoi}. Honoraires proposés : ${honorairesCourt(actuelle)}.`,
          metadata: { bien: bienTitre || null },
        });
        if (eJ) return ko('enregistrement', 500, { detail: eJ.message });
        /* Colonnes réelles de la table : date_echeance / note / statut. */
        await ecritServeur('La relance', sb.from('relances').insert({
          client_id: recherche.client_id, recherche_id: recherche.id,
          type: 'rappel_client', statut: 'en_attente', date_echeance: new Date().toISOString(),
          note: `Question sur le mandat ${quoi} — à rappeler (honoraires proposés : ${honorairesCourt(actuelle)})`.slice(0, 600),
        }));
        await evt('mandat', 'Question sur le mandat : demande de rappel');
        if (await alerteMailActive(sb, 'mandat_question')) await envoyerMail({
          a: ALERTES(), deLaPartDe: 'crm',
          sujet: `📞 ${nomClient} a une question sur son mandat`,
          texte: `${nomClient} a ouvert son mandat de recherche et souhaite être rappelé ${quoi}.\nHonoraires proposés : ${honorairesCourt(actuelle)}.${tel ? `\nSon téléphone : ${tel}` : ''}\n\nSi vous convenez d'autres honoraires (un autre taux ou un forfait), change-les dans sa fiche (« Faire signer le mandat ») puis envoie-lui le mandat par e-mail.\n\n${lienCrm}`,
          html: gabarit(`${nomClient} a une question sur son mandat`, `<p><b>${echappe(nomClient)}</b> a ouvert son mandat de recherche et souhaite être rappelé ${echappe(quoi)}.</p>
            <p>Honoraires proposés : <b>${echappe(honorairesCourt(actuelle))}</b>${tel ? ` · Son téléphone : <b>${echappe(tel)}</b>` : ''}</p>
            <p>Si vous convenez d’autres honoraires (un autre taux ou un forfait), change-les dans sa fiche (« Faire signer le mandat »), puis envoie-lui le mandat par e-mail.</p>
            <a href="${lienCrm}" style="display:inline-block;margin-top:8px;background:#c9a84c;color:#1a2332;text-decoration:none;padding:11px 16px;border-radius:10px;font-weight:800">Ouvrir sa fiche</a>`),
        });
        return NextResponse.json({ ok: true });
      }

      default:
        return ko('etape inconnue', 400);
    }
  } catch (e) {
    console.error('[espace/mandat]', e);
    return ko('erreur', 500);
  }
}
