import { NextRequest, NextResponse } from 'next/server';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { createHash, randomInt, randomUUID, timingSafeEqual } from 'crypto';
import {
  redigerMandat, resumeMandat, figerContenu, etatMandat, finRetractation, masquerEmail, validerMandant,
  dateLongue, dateCourte, heureParis, jourParis, titreMandat, honorairesCourt, euros, DUREE, RETRACTATION_JOURS,
  rechercheDepuis, versionMandat, type Mandant, type Contenu,
} from '@/lib/mandat';
import { pdfMandat, pdfSigne } from '@/lib/mandat-pdf';
import { lireReserve, prendreNumero, envoyerMail, gabarit, echappe, ALERTES, CRM, appareilDe, RESERVE_ALERTE } from '@/lib/mandat-serveur';

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
};

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
      sb.from('espace_evenements').insert({ recherche_id: recherche.id, client_id: recherche.client_id, bien_id: null, type, detail });
    const nomClient = `${client.prenom || ''} ${client.nom || ''}`.trim() || 'Un client';
    const lienCrm = `${CRM()}/?page=fiche&client=${encodeURIComponent(recherche.client_id)}`;

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
           page est ouverte, l'écran se met à jour avant que le client lise. */
        return NextResponse.json({ ok: true, recherche: rechercheDepuis(recherche) });
      }

      /* ── ses coordonnées, puis le code ─────────────────────── */
      case 'code': {
        if (etatMandat(recherche) === 'valide') return ko('deja', 409);
        const actuelle = rechercheDepuis(recherche);
        if (body.version !== versionMandat(actuelle)) return ko('change', 409, { recherche: actuelle });
        const v = validerMandant(body.mandant);
        if (!v.ok) return ko('coordonnees', 400, { champs: v.champs });
        const mandant = v.mandant;

        const avant = await derniere(sb, recherche.id);
        const reprise = avant && avant.statut === 'en_cours' ? avant : null;
        if (reprise?.code_envoye_le && Date.now() - Date.parse(reprise.code_envoye_le) < ECART_ENVOIS_S * 1000) {
          return ko('attendre', 429, { secondes: ECART_ENVOIS_S });
        }
        if (reprise && reprise.codes_envoyes >= CODES_MAX) return ko('trop', 429);

        /* Le numéro : celui de la ligne en cours, sinon celui qu'Alexandre a
           préparé, sinon le premier de sa réserve. Il est posé AVANT la
           signature, comme l'exige le registre. */
        const reserve = await lireReserve(sb);
        let numero = reprise?.numero || (typeof recherche.mandat_numero === 'string' && recherche.mandat_numero.trim()) || '';
        let agenceLe: string | null = reprise?.contenu?.agenceLe
          ?? (recherche.mandat_numero ? (recherche.mandat_propose_le || reserve.approuveLe || null) : null);
        let source = reprise?.contenu?.source || (recherche.mandat_numero ? 'prepare' : '');
        if (!numero) {
          const pris = await prendreNumero(sb);
          if (!pris) return ko('numero', 409);
          numero = pris.numero; agenceLe = pris.approuveLe; source = 'reserve';
          const { error: eNum } = await sb.from('recherches').update({ mandat_numero: numero, mandat_type: 'simple' }).eq('id', recherche.id);
          /* Le registre avant tout : Alexandre doit reporter ce numéro dans
             ImmoFacile, avec la date d'aujourd'hui. */
          const reste = pris.restants <= RESERVE_ALERTE
            ? `<p style="color:#b45309"><b>Il ne te reste que ${pris.restants} numéro${pris.restants > 1 ? 's' : ''} d'avance.</b> Pense à en réserver d'autres dans ImmoFacile et à les ajouter dans le CRM.</p>` : '';
          await envoyerMail({
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
        const id = reprise?.id || randomUUID();
        const deroule = [...(reprise?.deroule || [])];
        if (!reprise) {
          const { data: vu } = await sb.from('espace_evenements').select('created_at')
            .eq('recherche_id', recherche.id).eq('type', 'mandat').order('created_at', { ascending: false }).limit(1).maybeSingle();
          if (vu?.created_at) deroule.push({ t: vu.created_at, x: 'Mandat affiché dans son espace personnel, récapitulatif lu' });
          deroule.push({ t: maintenant, x: 'Coordonnées confirmées par le signataire' });
        }
        deroule.push({ t: maintenant, x: `${reprise ? 'Nouveau code' : 'Code à 6 chiffres'} envoyé à ${mandant.email}` });

        const code = String(randomInt(0, 1_000_000)).padStart(6, '0');
        const ligne = {
          id, recherche_id: recherche.id, client_id: recherche.client_id, numero, type: 'simple', statut: 'en_cours',
          mandant, contenu: { ...figerContenu(actuelle), agenceLe, source },
          code_hash: hacher(code, id), code_expire_le: new Date(Date.now() + CODE_MINUTES * 60_000).toISOString(),
          code_essais: 0, codes_envoyes: (reprise?.codes_envoyes || 0) + 1, code_envoye_le: maintenant, deroule,
        };
        const { error } = reprise
          ? await sb.from('mandats_signatures').update(ligne).eq('id', id)
          : await sb.from('mandats_signatures').insert(ligne);
        if (error) return ko('enregistrement', 500, { detail: error.message });

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
          await sb.from('mandats_signatures').update({ code_essais: essais }).eq('id', l.id);
          return ko('code', 400, { restants: Math.max(0, CODE_ESSAIS - essais) });
        }

        /* ── le code est bon : on signe ── */
        const le = new Date().toISOString();
        const ip = (req.headers.get('x-forwarded-for') || req.headers.get('x-real-ip') || '').split(',')[0].trim();
        const appareil = appareilDe(req.headers.get('user-agent') || '');
        const m = l.mandant;
        const nom = `${m.prenom} ${m.nom}`.trim();
        const tentative = l.code_essais === 0 ? '1re tentative' : `${l.code_essais + 1}e tentative`;
        const deroule = [...(l.deroule || []),
          { t: le, x: `Code saisi et validé (${tentative})` },
          { t: le, x: `Cases cochées : « J’ai lu l’information précontractuelle et mon mandat de recherche, et je les accepte » · « ${execution
            ? 'Je demande que la recherche commence tout de suite, sans attendre la fin de mon délai de rétractation'
            : 'Je préfère que la recherche commence à la fin de mon délai de rétractation'} »` },
        ];

        /* La signature manuscrite d'Alexandre, si elle est déposée. */
        let griffe: Uint8Array | null = null;
        try {
          const { data: f } = await sb.storage.from(BUCKET).download(SIGNATURE_AGENCE);
          if (f) griffe = new Uint8Array(await f.arrayBuffer());
        } catch { griffe = null; }

        const contenu = l.contenu;
        const parties = redigerMandat({
          numero: l.numero, mandant: m, recherche: contenu.recherche, executionImmediate: execution,
          signature: { le, email: m.email },
        });
        const sig = { mandantNom: nom, le, email: m.email, agenceLe: contenu.agenceLe || null };
        const seul = await pdfMandat(parties, {
          numero: l.numero, mandantNom: nom, resume: resumeMandat(contenu.recherche), sig,
          pagesEnTout: n => n + 1, signatureAgence: griffe,
        });
        const empreinte = createHash('sha256').update(seul).digest('hex');
        const signe = await pdfSigne(seul, {
          numero: l.numero, mandant: { nom, adresse: m.adresse, email: m.email, telephone: m.telephone },
          signeLe: le, ip, appareil, empreinte, deroule, executionImmediate: execution, agenceLe: contenu.agenceLe || null,
        });

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
        }).eq('id', l.id);
        if (eLigne) return ko('enregistrement', 500, { detail: eLigne.message });

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
        await sb.from('journal').insert({
          client_id: recherche.client_id, recherche_id: recherche.id,
          type: 'mandat', titre: '✍️ Mandat signé en ligne par le client',
          description: `n° ${l.numero} · ${honorairesCourt(contenu)} · ${DUREE.initiale} jours renouvelables, 12 mois au plus · ${execution ? 'recherche lancée tout de suite' : 'recherche après les 14 jours'}${ecarts.length ? `\n⚠️ ${ecarts.join('\n⚠️ ')}` : ''}`,
          metadata: { signature_id: l.id, numero: l.numero, empreinte },
        });
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
        await envoyerMail({
          a: ALERTES(), deLaPartDe: 'crm', pj,
          sujet: `✍️ ${nom} a signé son mandat (n° ${l.numero})`,
          texte: `${nom} vient de signer son mandat de recherche n° ${l.numero} depuis son espace, le ${dateCourte(le)} à ${heureParis(le)}.\nPrix maximum : ${prix}. Honoraires : ${honorairesCourt(contenu)}.\n${execution ? 'Il a demandé que la recherche commence tout de suite.' : 'Il préfère attendre la fin de ses 14 jours : pas de visite avant le ' + dateCourte(limite) + '.'}\n${contenu.source === 'reserve' ? `\nNuméro pris dans ta réserve : reporte-le dans ImmoFacile.` : ''}${ecarts.map(e => `\n⚠️ ${e}`).join('')}${eClient ? `\n⚠️ Sa copie n'a pas pu lui être envoyée (${eClient}) : envoie-lui le PDF ci-joint.` : ''}${eFiche ? `\n⚠️ La fiche n'a pas pu être mise à jour (${eFiche.message}) : remplis le bloc Mandat à la main.` : ''}\n\n${lienCrm}`,
          html: gabarit(`${nom} a signé son mandat`, `<p><b>${echappe(nom)}</b> vient de signer son mandat de recherche <b>n° ${echappe(l.numero)}</b> depuis son espace, le ${dateCourte(le)} à ${heureParis(le)}.</p>
            <p>Prix maximum : ${echappe(prix)} · Honoraires : ${echappe(honorairesCourt(contenu))}</p>
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
        if (!l || !l.pdf_chemin || (l.statut !== 'signe' && l.statut !== 'retracte')) return ko('aucun', 404);
        const { data, error } = await sb.storage.from(BUCKET)
          .createSignedUrl(l.pdf_chemin, 120, { download: `Mandat-de-recherche-${l.numero}.pdf` });
        if (error || !data?.signedUrl) return ko('stockage', 500);
        return NextResponse.json({ ok: true, url: data.signedUrl });
      }

      /* ── il renonce, dans les 14 jours ────────────────────── */
      case 'renoncer': {
        if (body.confirme !== true) return ko('confirmer', 400);
        const l = await derniere(sb, recherche.id);
        if (!l || l.statut !== 'signe' || !l.signe_le) return ko('aucun', 404);
        if (Date.now() > finRetractation(l.signe_le).getTime()) return ko('delai', 409);
        const le = new Date().toISOString();
        const { error } = await sb.from('mandats_signatures').update({
          statut: 'retracte', retracte_le: le,
          deroule: [...(l.deroule || []), { t: le, x: 'Rétractation exercée en ligne depuis son espace personnel' }],
        }).eq('id', l.id);
        if (error) return ko('enregistrement', 500, { detail: error.message });
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
        await sb.from('journal').insert({
          client_id: recherche.client_id, recherche_id: recherche.id, type: 'mandat',
          titre: '↩️ Le client a renoncé à son mandat (délai de rétractation)',
          description: `Mandat n° ${l.numero}, signé le ${dateCourte(l.signe_le)}, rétracté en ligne le ${dateCourte(le)} à ${heureParis(le)}.`,
          metadata: { signature_id: l.id, numero: l.numero },
        });
        await evt('mandat', `Renonciation au mandat n° ${l.numero}`);
        /* Une relance du jour : elle sort en rouge dans Relances et sur le
           tableau de bord. Colonnes réelles : date_echeance / note / statut. */
        await sb.from('relances').insert({
          client_id: recherche.client_id, recherche_id: recherche.id,
          type: 'rappel_client', statut: 'en_attente', date_echeance: le,
          note: `À rappeler : il a renoncé à son mandat de recherche n° ${l.numero} (délai de rétractation). Le noter dans le registre ImmoFacile.`,
        });

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
        await envoyerMail({
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
        await sb.from('relances').insert({
          client_id: recherche.client_id, recherche_id: recherche.id,
          type: 'rappel_client', statut: 'en_attente', date_echeance: new Date().toISOString(),
          note: `Question sur le mandat ${quoi} — à rappeler (honoraires proposés : ${honorairesCourt(actuelle)})`.slice(0, 600),
        });
        await evt('mandat', 'Question sur le mandat : demande de rappel');
        await envoyerMail({
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
