import { NextRequest, NextResponse } from 'next/server';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { createHash, randomInt, timingSafeEqual } from 'crypto';
import { validerMandant, masquerEmail, dateLongue, dateCourte, heureParis, type Mandant } from '@/lib/mandat';
import {
  lireCos, sceller, lireGriffe, rangerGriffe, envoyerExemplaire, finRetractationDe, nomDe, lienValide, dansLeMandat, attendu,
  BUCKET, type Co, type LigneMandat,
} from '@/lib/cosignature';
import { envoyerMail, gabarit, echappe, ALERTES, CRM, appareilDe } from '@/lib/mandat-serveur';
import { alerteMailActive } from '@/lib/alertes';
import { modele } from '@/lib/actes';
import * as SD from '@/lib/signature-documents';
import { ecritServeur } from '@/lib/ecritures';
import { observer } from '@/lib/registre';

/**
 * La signature d'un co-signataire — le conjoint, un co-acquéreur — depuis
 * SON lien personnel (espace.emilio-immo.com/signer/<jeton>). Il n'a pas
 * d'espace : ce lien est sa seule porte, et il ne montre que le mandat.
 *
 *   POST /api/signer  { jeton, etape: 'afficher' }
 *        il ouvre le lien : on le note (une fois)
 *   POST /api/signer  { jeton, etape: 'code', personne, certifie }
 *        il vérifie ses informations (il peut corriger ce que le premier
 *        signataire a saisi pour lui) ; un code part à SON adresse. Les 15
 *        minutes courent à partir de là, pas de l'envoi du lien
 *   POST /api/signer  { jeton, etape: 'signer', code, accepte, griffe }
 *        il signe : le mandat est refait avec sa signature et scellé à
 *        nouveau ; complet, chacun en reçoit l'exemplaire final
 *   POST /api/signer  { jeton, etape: 'pdf' }
 *   POST /api/signer  { jeton, etape: 'renoncer', confirme }
 *        sa rétractation : le mandat continue avec les autres signataires
 *   POST /api/signer  { jeton, etape: 'decliner' }
 *        « Je ne suis pas concerné par cet achat » : le premier signataire et
 *        Alexandre sont prévenus ; le mandat continue sans lui
 *
 * Public dans src/proxy.ts : la serrure, c'est le jeton (16 caractères tirés
 * au hasard), vérifié ici à chaque appel.
 *
 * Le même lien sert aux documents de la rubrique Documents signés en ligne
 * (mandat de vente, avenant, offre…) : un jeton qui n'est pas celui d'un
 * co-signataire est cherché dans `documents_signataires` (voir
 * signerDocument, plus bas) : afficher, code, signer, pdf.
 */

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const SECRET = process.env.SUPABASE_SERVICE_ROLE_KEY || 'emilio-mandat';
const CODE_MINUTES = 15;
const CODE_ESSAIS = 5;
const CODES_MAX = 6;
const ECART_ENVOIS_S = 45;
const JETON = /^[a-z0-9-]{12,80}$/;

const hacher = (code: string, id: string) => createHash('sha256').update(`${code}:${id}:${SECRET}`).digest('hex');
const egal = (a: string, b: string) => {
  const x = Buffer.from(a), y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
};
const ko = (error: string, status = 400, plus: Record<string, unknown> = {}) =>
  NextResponse.json({ ok: false, error, ...plus }, { status });

function base() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
}

async function charger(sb: SupabaseClient, jeton: string): Promise<{ co: Co; l: LigneMandat; cos: Co[] } | null> {
  const { data: co } = await sb.from('mandats_cosignataires').select('*').eq('jeton', jeton).maybeSingle();
  if (!co) return null;
  const { data: l } = await sb.from('mandats_signatures').select('*').eq('id', co.signature_id).maybeSingle();
  if (!l) return null;
  return { co: co as Co, l: l as LigneMandat, cos: await lireCos(sb, l.id) };
}

const CHAMPS_FR: Record<string, string> = {
  civilite: 'civilité', prenom: 'prénom', nom: 'nom', naissanceDate: 'date de naissance', naissanceLieu: 'lieu de naissance',
  adresse: 'adresse', email: 'e-mail', telephone: 'téléphone',
};
const net = (t: unknown) => String(t || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z@.0-9]/g, '');
const bouton = (href: string, t: string) =>
  `<a href="${href}" style="display:inline-block;margin-top:8px;background:#c9a84c;color:#1a2332;text-decoration:none;padding:11px 16px;border-radius:10px;font-weight:800">${t}</a>`;

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const jeton = typeof body?.jeton === 'string' ? body.jeton : '';
    if (!JETON.test(jeton)) return ko('lien invalide', 401);
    const etape = String(body?.etape || '');
    const sb = base();
    const x = await charger(sb, jeton);
    if (!x) return signerDocument(req, sb, jeton, etape, body);
    const { co, l, cos } = x;
    const moi = nomDe(co.personne), premier = nomDe(l.mandant);
    const lienCrm = `${CRM()}/?page=fiche&client=${encodeURIComponent(l.client_id || '')}`;
    const evt = (detail: string) => ecritServeur('Le suivi de l’espace', sb.from('espace_evenements').insert({ recherche_id: l.recherche_id, client_id: l.client_id, bien_id: null, type: 'mandat', detail }));
    const journal = (titre: string, description: string) => ecritServeur('L’historique du client', sb.from('journal').insert({
      client_id: l.client_id, recherche_id: l.recherche_id, type: 'mandat', titre, description, metadata: { signature_id: l.id, cosignataire_id: co.id, numero: l.numero },
    }));
    /* Le mandat est-il encore là pour lui ? Le premier signataire a pu y
       renoncer, Alexandre a pu clore l'invitation. */
    const ouvert = co.statut === 'invite' && l.statut === 'partiel';

    switch (etape) {

      case 'afficher': {
        if (co.statut === 'invite' && !co.ouvert_le) {
          const le = new Date().toISOString();
          await ecritServeur('L’ouverture du lien', sb.from('mandats_cosignataires').update({
            ouvert_le: le, deroule: [...(co.deroule || []), { t: le, x: 'Lien personnel ouvert, mandat affiché' }],
          }).eq('id', co.id));
        }
        return NextResponse.json({ ok: true });
      }

      /* ── ses informations, puis son code ─────────────────────── */
      case 'code': {
        if (!ouvert) return ko('etat', 409, { statut: co.statut });
        if (!lienValide(co)) return ko('lien_expire', 410);
        /* V3.43 : le code part à l'adresse qui a reçu ce lien, jamais à une
           adresse tapée sur la page. Sinon, qui tenait le lien pouvait
           recevoir le code ailleurs, et le certificat disait « e-mail
           vérifié ». Une adresse fausse se corrige depuis l'espace du premier
           signataire, qui envoie un nouveau lien. */
        const brut = body.personne && typeof body.personne === 'object' ? body.personne as Record<string, unknown> : {};
        const v = validerMandant({ ...brut, email: co.personne.email });
        if (!v.ok) return ko('coordonnees', 400, { champs: v.champs });
        const p = v.mandant;
        const pris = [l.mandant.email, ...cos.filter(c => c.id !== co.id && dansLeMandat(c)).map(c => c.personne.email)].map(e => String(e).toLowerCase());
        if (pris.includes(p.email)) return ko('coordonnees', 400, { champs: { email: 'Cette adresse est celle d’un autre signataire : indiquez la vôtre.' } });
        if (co.code_envoye_le && Date.now() - Date.parse(co.code_envoye_le) < ECART_ENVOIS_S * 1000) return ko('attendre', 429);
        const remise = !co.code_envoye_le || Date.now() - Date.parse(co.code_envoye_le) > 3_600_000;
        if (!remise && co.codes_envoyes >= CODES_MAX) return ko('quota', 429);

        const le = new Date().toISOString();
        const deroule = [...(co.deroule || [])];
        if (!co.code_envoye_le) deroule.push({ t: le, x: body.certifie === true ? 'Informations vérifiées et certifiées exactes et complètes par le signataire' : 'Informations vérifiées par le signataire' });
        const changes = (Object.keys(CHAMPS_FR) as (keyof Mandant)[]).filter(k => net(p[k]) !== net(co.personne[k]));
        if (changes.length) deroule.push({ t: le, x: `Informations corrigées par le signataire lui-même : ${changes.map(k => CHAMPS_FR[k]).join(', ')}` });
        deroule.push({ t: le, x: `${co.code_envoye_le ? 'Nouveau code' : 'Code à 6 chiffres'} envoyé à ${p.email}` });
        const code = String(randomInt(0, 1_000_000)).padStart(6, '0');
        const { error } = await sb.from('mandats_cosignataires').update({
          personne: p, code_hash: hacher(code, co.id), code_expire_le: new Date(Date.now() + CODE_MINUTES * 60_000).toISOString(),
          code_essais: 0, codes_envoyes: remise ? 1 : co.codes_envoyes + 1, code_envoye_le: le, deroule,
        }).eq('id', co.id);
        if (error) return ko('enregistrement', 500, { detail: error.message });
        const joli = `${code.slice(0, 3)} ${code.slice(3)}`;
        const eMail = await envoyerMail({
          a: p.email, nomA: nomDe(p), deLaPartDe: 'agence',
          sujet: `Votre code de signature : ${code}`,
          texte: `Bonjour ${p.prenom},\n\nVoici votre code pour signer votre mandat de recherche : ${joli}\n\nIl est valable ${CODE_MINUTES} minutes.\n\nSi vous n'êtes pas à l'origine de cette demande, ignorez simplement ce message.\n\nAlexandre Rogelet — Emilio Immobilier`,
          html: gabarit('Votre code de signature', `<p>Bonjour ${echappe(p.prenom)},</p>
            <p>Voici votre code pour signer votre mandat de recherche :</p>
            <div style="margin:16px 0;font-size:32px;font-weight:800;letter-spacing:8px;color:#1a2332">${joli}</div>
            <p>Il est valable ${CODE_MINUTES} minutes.</p>`,
            'Si vous n’êtes pas à l’origine de cette demande, ignorez simplement ce message.'),
        });
        if (eMail) return ko('mail', 502);
        return NextResponse.json({ ok: true, email: masquerEmail(p.email) });
      }

      /* ── sa signature ────────────────────────────────────────── */
      case 'signer': {
        const code = String(body.code || '').replace(/\D/g, '');
        if (code.length !== 6) return ko('code', 400);
        if (body.accepte !== true) return ko('accepte', 400);
        /* Sa propre demande d'exécution immédiate : chacun la fait pour lui. */
        if (typeof body.execution !== 'boolean') return ko('execution', 400);
        const execution = body.execution as boolean;
        if (co.statut === 'signe') return NextResponse.json({ ok: true, deja: true });
        if (!ouvert || !co.code_hash) return ko('recommencer', 409);
        if (co.code_essais >= CODE_ESSAIS) return ko('trop', 429);
        if (!co.code_expire_le || Date.parse(co.code_expire_le) < Date.now()) return ko('expire', 410);
        /* V3.43 : l'essai est réservé avant de comparer, en une requête
           (compare puis écrit) : des essais lancés en même temps ne lisent
           plus tous « 0 essai », et un double clic ne signe pas deux fois. */
        const essais = co.code_essais + 1;
        const { data: resa, error: eR } = await sb.from('mandats_cosignataires').update({ code_essais: essais })
          .eq('id', co.id).eq('code_essais', co.code_essais).select('id');
        if (eR) return ko('enregistrement', 500, { detail: eR.message });
        if (!resa?.length || !egal(hacher(code, co.id), co.code_hash)) {
          return ko('code', 400, { restants: Math.max(0, CODE_ESSAIS - essais) });
        }

        const le = new Date().toISOString();
        const ip = (req.headers.get('x-forwarded-for') || req.headers.get('x-real-ip') || '').split(',')[0].trim();
        const appareil = appareilDe(req.headers.get('user-agent') || '');
        const png = lireGriffe(body.griffe);
        const griffeChemin = await rangerGriffe(sb, l.recherche_id, l.numero, `co${co.rang}`, png);
        const tentative = co.code_essais === 0 ? '1re tentative' : `${co.code_essais + 1}e tentative`;
        const coS: Co = {
          ...co, statut: 'signe', signe_le: le, ip, appareil, email_verifie: co.personne.email, griffe_chemin: griffeChemin,
          code_hash: null, code_essais: co.code_essais + 1, execution_immediate: execution,
          deroule: [...(co.deroule || []),
            ...(png ? [{ t: le, x: griffeChemin ? 'Signature tracée à la main sur l’écran' : 'Signature tracée à la main sur l’écran, mais le tracé n’a pas pu être conservé' }] : []),
            { t: le, x: `Code saisi et validé (${tentative})` },
            { t: le, x: `Cases cochées : « J’ai lu le mandat de recherche et je l’accepte » · « ${execution
              ? 'Je demande que la mission commence dès ma signature, sans attendre la fin de mon délai de rétractation'
              : 'Je préfère que la mission commence à la fin de mon délai de rétractation'} »` },
          ],
        };
        const cosN = cos.map(c => (c.id === co.id ? coS : c));
        const sc = await sceller(sb, l, cosN);
        if (!sc.ok) return ko('stockage', 500, { detail: sc.erreur });
        const { error: eC } = await sb.from('mandats_cosignataires').update({
          statut: 'signe', signe_le: le, ip, appareil, email_verifie: coS.email_verifie, griffe_chemin: griffeChemin,
          code_hash: null, code_essais: coS.code_essais, deroule: coS.deroule, execution_immediate: execution,
        }).eq('id', co.id);
        if (eC) return ko('enregistrement', 500, { detail: eC.message });
        const { error: eL } = await sb.from('mandats_signatures').update(sc.maj).eq('id', l.id);
        if (eL) console.error('[signer] ligne du mandat', eL.message);

        /* Le registre des mandats (V3.18) : la co-signature, sur la ligne du mandat. */
        const pbReg = await observer(sb, { signature_id: l.id, numeroSinon: l.contenu?.source === 'registre' ? l.numero : null, type: 'note',
          texte: `Co-signé en ligne par ${moi}, le ${dateCourte(le)} à ${heureParis(le)}${sc.complet ? ' : mandat complet' : ''}.` });
        if (pbReg) console.error('[registre]', pbReg);
        const fin = finRetractationDe(l, cosN, co.id);
        const restants = cosN.filter(attendu);
        const echecs: string[] = [];
        if (sc.complet) {
          /* Chacun son exemplaire, avec SA date limite pour renoncer. */
          const signataires: [Mandant, string | undefined][] = [[l.mandant, undefined], ...cosN.filter(c => c.statut === 'signe').map((c): [Mandant, string] => [c.personne, c.id])];
          for (const [a, id] of signataires) {
            const e = await envoyerExemplaire({ a, numero: l.numero, signe: sc.signe, complet: true, fin: finRetractationDe(l, cosN, id), attendus: [] });
            if (e) echecs.push(`${nomDe(a)} : ${e}`);
          }
        } else {
          const e = await envoyerExemplaire({ a: co.personne, numero: l.numero, signe: sc.signe, complet: false, fin, attendus: restants.map(c => c.personne.prenom) });
          if (e) echecs.push(`${moi} : ${e}`);
        }
        await journal(`✍️ ${moi} a signé le mandat${sc.complet ? ' — mandat complet' : ''}`,
          `n° ${l.numero} · signé avec son lien personnel le ${dateCourte(le)} à ${heureParis(le)}${restants.length ? `\nOn attend encore : ${restants.map(c => nomDe(c.personne)).join(', ')}` : ''}${echecs.length ? `\n⚠️ Exemplaire non envoyé : ${echecs.join(' ; ')}` : ''}`);
        await evt(`${moi} a signé le mandat n° ${l.numero}${sc.complet ? ' (complet)' : ''}`);
        const pj = [{ nom: `Mandat-de-recherche-${l.numero}.pdf`, type: 'application/pdf', base64: Buffer.from(sc.signe).toString('base64') }];
        if (echecs.length || eL || await alerteMailActive(sb, 'mandat_signe')) await envoyerMail({
          a: ALERTES(), deLaPartDe: 'crm', pj,
          sujet: `✍️ ${moi} a signé le mandat de ${premier} (n° ${l.numero})${sc.complet ? ' · complet' : ''}`,
          texte: `${moi} vient de signer le mandat de recherche n° ${l.numero} avec son lien personnel, le ${dateCourte(le)} à ${heureParis(le)}.\n${sc.complet ? 'Le mandat est complet : chacun a reçu son exemplaire.' : `On attend encore ${restants.map(c => nomDe(c.personne)).join(', ')}.`}${echecs.length ? `\n⚠️ Exemplaire non envoyé : ${echecs.join(' ; ')}` : ''}${eL ? `\n⚠️ La ligne du mandat n'a pas pu être mise à jour (${eL.message}).` : ''}\n\n${lienCrm}`,
          html: gabarit(`${moi} a signé le mandat`, `<p><b>${echappe(moi)}</b> vient de signer le mandat de recherche <b>n° ${echappe(l.numero)}</b> de ${echappe(premier)}, avec son lien personnel, le ${dateCourte(le)} à ${heureParis(le)}.</p>
            <p>${sc.complet ? '<b>Le mandat est complet</b> : chacun a reçu son exemplaire.' : `On attend encore ${echappe(restants.map(c => nomDe(c.personne)).join(', '))}.`}</p>
            ${echecs.length ? `<p style="color:#b91c1c">⚠️ Exemplaire non envoyé : ${echappe(echecs.join(' ; '))}</p>` : ''}
            ${bouton(lienCrm, 'Ouvrir la fiche')}`,
            'Le PDF signé, avec son certificat, est en pièce jointe et dans le dossier privé des mandats.'),
        });
        return NextResponse.json({ ok: true, complet: sc.complet, signeLe: le, finRetractation: fin ? fin.toISOString() : null });
      }

      /* ── son exemplaire ──────────────────────────────────────── */
      case 'pdf': {
        if (!['signe', 'retracte'].includes(co.statut) || !l.pdf_chemin) return ko('aucun', 404);
        const { data, error } = await sb.storage.from(BUCKET)
          .createSignedUrl(l.pdf_chemin, 120, { download: `Mandat-de-recherche-${l.numero}.pdf` });
        if (error || !data?.signedUrl) return ko('stockage', 500);
        return NextResponse.json({ ok: true, url: data.signedUrl });
      }

      /* ── il renonce, dans les 14 jours ───────────────────────── */
      case 'renoncer': {
        if (body.confirme !== true) return ko('confirmer', 400);
        if (co.statut !== 'signe') return ko('aucun', 404);
        const fin = finRetractationDe(l, cos, co.id);
        if (!fin || Date.now() > fin.getTime()) return ko('delai', 409);
        const le = new Date().toISOString();
        const { error } = await sb.from('mandats_cosignataires').update({
          statut: 'retracte', retracte_le: le, deroule: [...(co.deroule || []), { t: le, x: 'Rétractation exercée en ligne, depuis son lien personnel' }],
        }).eq('id', co.id);
        if (error) return ko('enregistrement', 500, { detail: error.message });
        const pbRegR = await observer(sb, { signature_id: l.id, numeroSinon: l.contenu?.source === 'registre' ? l.numero : null, type: 'note',
          texte: `${moi} a renoncé au mandat (délai de rétractation), le ${dateCourte(le)} à ${heureParis(le)} ; il continue avec ${premier}.` });
        if (pbRegR) console.error('[registre]', pbRegR);
        await journal(`↩️ ${moi} a renoncé au mandat (délai de rétractation)`, `n° ${l.numero} · le ${dateCourte(le)} à ${heureParis(le)}. Le mandat continue avec ${premier}.`);
        await evt(`${moi} a renoncé au mandat n° ${l.numero}`);
        await ecritServeur('La relance', sb.from('relances').insert({
          client_id: l.client_id, recherche_id: l.recherche_id, type: 'rappel_client', statut: 'en_attente', date_echeance: le,
          note: `${moi} a renoncé au mandat de recherche n° ${l.numero} ; il continue avec ${premier}. À rappeler.`,
        }));
        await envoyerMail({
          a: co.personne.email, nomA: moi, repondreA: 'agence@emilio-immo.com',
          sujet: `Votre renonciation au mandat de recherche n° ${l.numero}`,
          texte: `Bonjour ${co.personne.prenom},\n\nNous avons bien reçu votre renonciation au mandat de recherche n° ${l.numero}, le ${dateLongue(le)} à ${heureParis(le)}. Il ne vous engage plus, sans aucun frais.\n\nAlexandre Rogelet — Emilio Immobilier`,
          html: gabarit('Votre renonciation est enregistrée', `<p>Bonjour ${echappe(co.personne.prenom)},</p>
            <p>Nous avons bien reçu votre renonciation au <b>mandat de recherche n° ${echappe(l.numero)}</b>, le ${dateLongue(le)} à ${heureParis(le)}. Il ne vous engage plus, sans aucun frais.</p>
            <p>Alexandre Rogelet — Emilio Immobilier</p>`, 'Ce message vaut accusé de réception de votre rétractation.'),
        });
        await envoyerMail({
          a: l.mandant.email, nomA: premier, repondreA: 'agence@emilio-immo.com',
          sujet: `${co.personne.prenom} a renoncé au mandat de recherche n° ${l.numero}`,
          texte: `Bonjour ${l.mandant.prenom},\n\n${moi} a renoncé au mandat de recherche n° ${l.numero}, le ${dateLongue(le)}. Le mandat continue avec vous. Si vous souhaitez y mettre fin aussi, vous pouvez le faire depuis votre espace, rubrique « Ma recherche ».\n\nAlexandre Rogelet — Emilio Immobilier`,
          html: gabarit('Le mandat continue avec vous', `<p>Bonjour ${echappe(l.mandant.prenom)},</p>
            <p>${echappe(moi)} a renoncé au <b>mandat de recherche n° ${echappe(l.numero)}</b>, le ${dateLongue(le)}. Le mandat continue avec vous.</p>
            <p>Si vous souhaitez y mettre fin aussi, vous pouvez le faire depuis votre espace, rubrique « Ma recherche ».</p>
            <p>Alexandre Rogelet — Emilio Immobilier</p>`),
        });
        if (await alerteMailActive(sb, 'mandat_renonce')) await envoyerMail({
          a: ALERTES(), deLaPartDe: 'crm',
          sujet: `↩️ ${moi} a renoncé au mandat de ${premier} (n° ${l.numero})`,
          texte: `${moi} a exercé son droit de rétractation en ligne, le ${dateCourte(le)} à ${heureParis(le)}. Le mandat n° ${l.numero} continue avec ${premier}.\n\n${lienCrm}`,
          html: gabarit(`${moi} a renoncé au mandat`, `<p><b>${echappe(moi)}</b> a exercé son droit de rétractation en ligne, le ${dateCourte(le)} à ${heureParis(le)}.</p>
            <p>Le mandat <b>n° ${echappe(l.numero)}</b> continue avec ${echappe(premier)}.</p>${bouton(lienCrm, 'Ouvrir la fiche')}`),
        });
        return NextResponse.json({ ok: true });
      }

      /* ── « Je ne suis pas concerné par cet achat » ───────────── */
      case 'decliner': {
        if (!ouvert) return ko('etat', 409, { statut: co.statut });
        const le = new Date().toISOString();
        const coD: Co = { ...co, statut: 'decline', decline_le: le, code_hash: null,
          deroule: [...(co.deroule || []), { t: le, x: 'A indiqué ne pas être concerné par cet achat' }] };
        const cosN = cos.map(c => (c.id === co.id ? coD : c));
        /* Plus personne à attendre : le mandat est refait sans lui, et
           scellé une dernière fois. */
        let signe: Uint8Array | null = null;
        if (!cosN.some(attendu)) {
          const sc = await sceller(sb, l, cosN);
          if (!sc.ok) return ko('stockage', 500, { detail: sc.erreur });
          const { error: eL } = await sb.from('mandats_signatures').update(sc.maj).eq('id', l.id);
          if (eL) return ko('enregistrement', 500, { detail: eL.message });
          signe = sc.signe;
        }
        const { error } = await sb.from('mandats_cosignataires').update({
          statut: 'decline', decline_le: le, code_hash: null, deroule: coD.deroule,
        }).eq('id', co.id);
        if (error) return ko('enregistrement', 500, { detail: error.message });
        await journal(`🙅 ${moi} n’est pas concerné par cet achat`, `Mandat n° ${l.numero} : invitation déclinée depuis son lien, le ${dateCourte(le)} à ${heureParis(le)}. Le mandat continue avec ${premier}.`);
        await evt(`${moi} a décliné l’invitation au mandat n° ${l.numero}`);
        const fin = finRetractationDe(l, cosN);
        if (signe) {
          await envoyerExemplaire({ a: l.mandant, numero: l.numero, signe, complet: true, fin, attendus: [] });
        }
        await envoyerMail({
          a: l.mandant.email, nomA: premier, repondreA: 'agence@emilio-immo.com',
          sujet: `${co.personne.prenom} ne signera pas le mandat de recherche n° ${l.numero}`,
          texte: `Bonjour ${l.mandant.prenom},\n\n${moi} a indiqué ne pas être concerné par cet achat : il ne signera pas le mandat. Le mandat continue avec vous${signe ? ', et vous en trouverez la version définitive dans un autre message' : ''}.\n\nS'il s'agit d'une erreur, appelez Alexandre : il lui renverra un lien.\n\nAlexandre Rogelet — Emilio Immobilier`,
          html: gabarit('Le mandat continue avec vous', `<p>Bonjour ${echappe(l.mandant.prenom)},</p>
            <p>${echappe(moi)} a indiqué ne pas être concerné par cet achat : il ne signera pas le mandat. Le mandat continue avec vous${signe ? ', et vous en trouverez la version définitive dans un autre message' : ''}.</p>
            <p>S’il s’agit d’une erreur, appelez Alexandre : il lui renverra un lien.</p>
            <p>Alexandre Rogelet — Emilio Immobilier</p>`),
        });
        await envoyerMail({
          a: ALERTES(), deLaPartDe: 'crm',
          sujet: `🙅 ${moi} ne signera pas le mandat de ${premier} (n° ${l.numero})`,
          texte: `${moi} a indiqué, depuis son lien, ne pas être concerné par l'achat de ${premier}. Le mandat n° ${l.numero} continue avec ${premier}.\n\n${lienCrm}`,
          html: gabarit(`${moi} ne signera pas`, `<p><b>${echappe(moi)}</b> a indiqué, depuis son lien, ne pas être concerné par l’achat de ${echappe(premier)}.</p>
            <p>Le mandat <b>n° ${echappe(l.numero)}</b> continue avec ${echappe(premier)}.</p>${bouton(lienCrm, 'Ouvrir la fiche')}`),
        });
        return NextResponse.json({ ok: true });
      }

      default:
        return ko('etape inconnue', 400);
    }
  } catch (e) {
    console.error('[signer]', e);
    return ko('erreur', 500);
  }
}

/* ══ Un document de la rubrique Documents, signé avec son lien ═══════════ */

async function signerDocument(req: NextRequest, sb: SupabaseClient, jeton: string, etape: string, body: Record<string, unknown>) {
  const { data: brut, error: eS } = await sb.from('documents_signataires').select('*').eq('jeton', jeton).maybeSingle();
  if (eS || !brut) return ko('lien invalide', 401);
  const s = brut as SD.SigDoc;
  const { data: dr } = await sb.from('documents').select('*').eq('id', s.document_id).maybeSingle();
  const doc = dr as SD.DocSigne | null;
  const m = doc ? modele(doc.modele) : null;
  if (!doc || !m) return ko('lien invalide', 401);
  const d = doc.donnees;
  /* V3.50 : une lecture ratée arrête tout (avant, une liste vide laissait
     croire que plus personne n'était attendu), et il doit y figurer. */
  let sigs: SD.SigDoc[];
  try { sigs = await SD.lireSignataires(sb, doc.id); } catch (e) {
    console.error('[signer] signataires', (e as Error).message);
    return ko('lecture', 503);
  }
  if (!sigs.some(x => x.id === s.id)) {
    console.error('[signer] signataire absent de la liste', s.id);
    return ko('lecture', 503);
  }
  const moi = SD.nomSig(s);
  const nd = SD.nomDocument(m, d);
  const lienCrm = SD.lienCrmDocument(doc);
  /* Le document l'attend-il encore ? Alexandre a pu arrêter la signature,
     ou le document a pu être annulé. */
  const ouvert = s.statut === 'invite' && doc.statut === 'pret' && !!doc.signature;
  /* V3.50 : une offre d'achat passée sa date de validité ne se signe plus. */
  const finOffre = SD.offreFinie(m, d);

  switch (etape) {
    case 'afficher': {
      if (s.statut === 'invite' && !s.ouvert_le) {
        const le = new Date().toISOString();
        await ecritServeur('L’ouverture du lien', sb.from('documents_signataires').update({ ouvert_le: le, deroule: [...(s.deroule || []), { t: le, x: 'Lien personnel ouvert, document affiché' }] }).eq('id', s.id));
      }
      return NextResponse.json({ ok: true });
    }

    case 'code': {
      if (!ouvert) return ko('etat', 409, { statut: s.statut });
      if (finOffre) return ko('offre_expiree', 410, { fin: finOffre.toISOString() });
      if (!SD.lienValide(s)) return ko('lien_expire', 410);
      const r = await SD.envoyerCode(sb, s, sigs, m, d);
      if ('erreur' in r) return ko(r.erreur, r.statut, r.plus || {});
      return NextResponse.json({ ok: true, email: r.email });
    }

    case 'signer': {
      if (body.accepte !== true) return ko('accepte', 400);
      if (s.statut === 'signe') return NextResponse.json({ ok: true, deja: true });
      if (!ouvert) return ko('recommencer', 409);
      if (finOffre) return ko('offre_expiree', 410, { fin: finOffre.toISOString() });
      if (!SD.lienValide(s)) return ko('lien_expire', 410);
      const ip = (req.headers.get('x-forwarded-for') || req.headers.get('x-real-ip') || '').split(',')[0].trim();
      const appareil = appareilDe(req.headers.get('user-agent') || '');
      const r = await SD.validerSignature(sb, s, m, d, { code: String(body.code || ''), griffe: body.griffe, ip, appareil, demande: body.demande === true });
      if ('erreur' in r) return ko(r.erreur, r.statut, r.plus || {});
      /* V3.50 : relus APRÈS l'enregistrement de sa signature. Deux derniers
         signataires au même moment voyaient chacun l'autre « attendu » (lu
         avant), et personne ne terminait : le document restait en signature.
         Relus ici, l'un des deux au moins voit tout le monde signé ; s'ils
         le voient tous les deux, terminer ne passe qu'une fois. Une relecture
         ratée : la liste du début, comme avant. */
      let relus = sigs;
      try { relus = await SD.lireSignataires(sb, doc.id); } catch (e) { console.error('[signer] relecture des signataires', (e as Error).message); }
      const tous = relus.map(x => (x.id === r.s.id ? r.s : x));
      const restants = tous.filter(x => SD.actif(x) && SD.attendu(x));
      const echecs: string[] = [];
      let pdf: Uint8Array | null = null;
      /* V3.33 : la signature est déjà notée « signée » ; si le PDF ne peut
         pas être scellé, un nouvel essai du signataire répond « déjà signé »
         et le document resterait « à signer » sans que personne le sache.
         Alexandre est donc prévenu, avec le geste qui débloque. */
      const bloque = async (detail: string) => {
        const geste = restants.length
          ? 'Sa signature est bien enregistrée. Le document continue d’attendre les autres signataires ; rien à faire pour l’instant.'
          : 'Tout le monde a signé. Ouvre le document dans Documents et clique sur « Tout le monde a signé : finaliser » : il sera scellé, envoyé à chacun et rangé.';
        const e = await envoyerMail({
          a: ALERTES(), deLaPartDe: 'crm', sujet: `⚠️ ${moi} a signé ${nd.le}, mais le PDF n’a pas pu être scellé`,
          texte: `${moi} vient de signer ${nd.le}, mais le PDF signé n’a pas pu être préparé (${detail}).\n\n${geste}\n\n${lienCrm}`,
          html: gabarit(`${moi} a signé, un geste à faire`, `<p><b>${echappe(moi)}</b> vient de signer ${echappe(nd.le)}, mais le PDF signé n’a pas pu être préparé.</p>
            <p>${echappe(geste)}</p><p style="color:#b91c1c;font-size:13px">Détail : ${echappe(detail)}</p>${bouton(lienCrm, 'Ouvrir le CRM')}`),
        });
        if (e) console.error('[signer] alerte blocage', e);
      };
      /* La ligne du suivi : celle de classer quand il est le dernier (V3.50,
         une seule ligne pour la signature finale, au lieu de deux). */
      let ligneFaite = false;
      if (!restants.length) {
        /* Le dernier : tout est scellé, envoyé à chacun, rangé. */
        const t = await SD.terminer(sb, doc, tous);
        if (t.erreur) { await bloque(t.erreur); return ko('stockage', 500, { detail: t.erreur }); }
        /* V3.50 : un autre signataire a fini au même instant, c'est lui qui
           scelle, envoie et range. Ici, rien d'autre à faire : ni second mail
           à Alexandre, ni PDF à moitié prêt. */
        if (t.deja) return NextResponse.json({ ok: true, complet: true, signeLe: r.s.signe_le || new Date().toISOString(), attendus: [] });
        pdf = t.signe || null;
        echecs.push(...t.echecs);
        ligneFaite = true;
      } else {
        /* Pas le dernier : une version scellée avec les signatures du
           moment, qu'il reçoit. V3.50 : écrite seulement si le document n'a
           pas été terminé entre-temps (un autre a pu signer en dernier). */
        const sc = await SD.sceller(sb, doc, tous);
        if ('erreur' in sc) { await bloque(sc.erreur); return ko('stockage', 500, { detail: sc.erreur }); }
        const { error: eD } = await sb.from('documents').update({ signature: sc.maj }).eq('id', doc.id).eq('statut', 'pret').is('signature->>complet_le', null);
        if (eD) echecs.push(`document : ${eD.message}`);
        pdf = sc.signe;
        const e = await SD.envoyerExemplaire({ s: r.s, m, d, signe: sc.signe, complet: false, attendus: restants.map(x => x.personne.prenom || SD.nomSig(x)) });
        if (e) echecs.push(`${moi} : ${e}`);
      }
      const le = r.s.signe_le || new Date().toISOString();
      /* L'historique qui ne s'écrit pas : le mail d'alerte part quand même, et le dit. */
      if (doc.client_id && !ligneFaite && !(await ecritServeur('L’historique du client', sb.from('journal').insert({
        client_id: doc.client_id, type: 'mandat', metadata: { document_id: doc.id, signataire_id: s.id },
        titre: `✍️ ${moi} a signé ${nd.court}${restants.length ? '' : ' — signé par tous'}`,
        description: `${doc.titre || m.titre} · signé avec son lien personnel le ${dateCourte(le)} à ${heureParis(le)}${restants.length ? `\nOn attend encore : ${restants.map(SD.nomSig).join(', ')}` : ''}${echecs.length ? `\n⚠️ ${echecs.join(' ; ')}` : ''}`,
      })))) echecs.push('la signature n’a pas été notée dans l’historique du client');
      if (echecs.length || await alerteMailActive(sb, 'document_signe')) {
        const titre = `✍️ ${moi} a signé ${nd.le}${restants.length ? '' : ' · signé par tous'}`;
        await envoyerMail({
          a: ALERTES(), deLaPartDe: 'crm', sujet: titre,
          ...(pdf ? { pj: [{ nom: SD.nomFichierPdf(m, d), type: 'application/pdf', base64: Buffer.from(pdf).toString('base64') }] } : {}),
          texte: `${moi} vient de signer ${nd.le} avec son lien personnel, le ${dateCourte(le)} à ${heureParis(le)}.\n${restants.length ? `On attend encore ${restants.map(SD.nomSig).join(', ')}.` : 'Tout le monde a signé : chacun a reçu son exemplaire, et le document est rangé dans Documents.'}${echecs.length ? `\n⚠️ ${echecs.join(' ; ')}` : ''}\n\n${lienCrm}`,
          html: gabarit(`${moi} a signé`, `<p><b>${echappe(moi)}</b> vient de signer ${echappe(nd.le)} avec son lien personnel, le ${dateCourte(le)} à ${heureParis(le)}.</p>
            <p>${restants.length ? `On attend encore ${echappe(restants.map(SD.nomSig).join(', '))}.` : '<b>Tout le monde a signé</b> : chacun a reçu son exemplaire, et le document est rangé dans Documents.'}</p>
            ${echecs.length ? `<p style="color:#b91c1c">⚠️ ${echappe(echecs.join(' ; '))}</p>` : ''}${bouton(lienCrm, 'Ouvrir le CRM')}`,
            'Le PDF signé, avec son certificat, est en pièce jointe et dans Documents.'),
        });
      }
      return NextResponse.json({ ok: true, complet: !restants.length, signeLe: le, attendus: restants.map(x => x.personne.prenom || SD.nomSig(x)) });
    }

    case 'pdf': {
      if (s.statut !== 'signe') return ko('aucun', 404);
      const chemin = doc.statut === 'signe' ? doc.signe_chemin : doc.signature?.scelle_chemin;
      if (!chemin) return ko('aucun', 404);
      const { data, error } = await sb.storage.from(SD.BUCKET).createSignedUrl(chemin, 120, { download: SD.nomFichierPdf(m, d) });
      if (error || !data?.signedUrl) return ko('stockage', 500);
      return NextResponse.json({ ok: true, url: data.signedUrl });
    }

    default:
      return ko('etape inconnue', 400);
  }
}
