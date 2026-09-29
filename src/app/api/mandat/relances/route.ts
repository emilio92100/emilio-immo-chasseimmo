import { NextRequest, NextResponse } from 'next/server';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { dateCourte } from '@/lib/mandat';
import { inviter, nomDe, lienValide, type Co, type LigneMandat } from '@/lib/cosignature';
import { envoyerMail, gabarit, echappe, ALERTES, CRM } from '@/lib/mandat-serveur';
import { modele } from '@/lib/actes';
import * as SD from '@/lib/signature-documents';
import { ecritServeur } from '@/lib/ecritures';
import { archiverRegistre, premierDuMois, type Archive } from '@/lib/registre-archive';
import { reprendreSuspendus } from '@/lib/suspension';
import { lienEspace } from '@/lib/jeton';

/**
 * Les rappels aux co-signataires qui n'ont pas encore signé.
 *
 * Appelée chaque matin par Vercel (vercel.json, « crons »). Publique dans
 * src/proxy.ts parce que Vercel n'a pas le cookie du CRM : c'est CRON_SECRET
 * qui fait la serrure, comme pour le point automatique. Sans elle, rien ne
 * part.
 *
 *   2 jours après l'envoi de son lien   rappel n° 1
 *   7 jours après                       rappel n° 2, et Alexandre est prévenu
 *   lien expiré (15 jours)              Alexandre est prévenu, une fois : à lui
 *                                       de relancer (nouveau lien) ou de clore
 *
 * `relances` compte ce qui est parti : 1, 2, puis 3 quand l'alerte de fin est
 * faite. Un nouveau lien (renvoyé d'une adresse corrigée, ou relancé par
 * Alexandre) le remet à zéro.
 *
 * Même chose, ensuite, pour les documents de la rubrique Documents envoyés
 * pour signature en ligne (`documents_signataires`) : rappels à 2 et 7
 * jours, puis Alexandre prévenu quand le lien expire.
 *
 * Et (V3.32) pour le mandat de recherche PROPOSÉ dans l'espace de l'acheteur
 * (« Faire signer le mandat ») qu'il n'a pas encore signé : un rappel à 2
 * jours, un second à 7 jours, et Alexandre prévenu avec le second.
 */

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const JOUR = 86_400_000;

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ ok: false, error: 'non autorisé' }, { status: 401 });
  }
  const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
  /* « Suspendu jusqu'au… » : les dossiers dont la date de reprise est
     arrivée repassent en « Actif » (src/lib/suspension.ts). La veille et
     l'ouverture du CRM le font aussi ; ici, c'est le filet du matin. */
  const reprise = await reprendreSuspendus(sb);
  for (const e of reprise.erreurs) console.error('[suspension] reprise', e);
  /* Le 1er du mois : l'archive du registre des mandats (V3.18), une fois. */
  let archive: Archive | null = null;
  if (premierDuMois()) {
    try { archive = await archiverRegistre(sb, { mensuelle: true }); } catch (e) { archive = { ok: false, erreur: (e as Error).message }; }
    if (archive && !archive.ok) console.error('[registre] archive mensuelle', archive.erreur);
  }
  const { data, error } = await sb.from('mandats_cosignataires').select('*').eq('statut', 'invite');
  const bilan: string[] = [];
  /* Le mandat proposé dans l'espace, pas encore signé (V3.32). */
  bilan.push(...await relancerPropositions(sb));
  /* Table absente (SQL pas encore lancé) : rien à faire. */
  if (error) return NextResponse.json({ ok: true, rien: error.message, bilan, archive, reprise });

  const lignes = new Map<string, LigneMandat | null>();
  for (const co of (data || []) as Co[]) {
    try {
      if (!lignes.has(co.signature_id)) {
        const { data: l } = await sb.from('mandats_signatures').select('*').eq('id', co.signature_id).maybeSingle();
        lignes.set(co.signature_id, (l as LigneMandat) || null);
      }
      const l = lignes.get(co.signature_id);
      if (!l || l.statut !== 'partiel' || !co.invite_le) continue;
      const age = Date.now() - Date.parse(co.invite_le);
      const lienCrm = `${CRM()}/?page=fiche&client=${encodeURIComponent(l.client_id || '')}`;
      const qui = nomDe(co.personne), premier = nomDe(l.mandant);

      if (!lienValide(co)) {
        if (co.relances >= 3) continue;
        /* La marque « déjà prévenu » d'abord : sans elle, l'alerte repartirait
           chaque jour. Si elle ne s'écrit pas, on réessaiera demain. */
        if (!(await ecritServeur('La marque de relance', sb.from('mandats_cosignataires').update({ relances: 3 }).eq('id', co.id)))) continue;
        await ecritServeur('L’historique du client', sb.from('journal').insert({
          client_id: l.client_id, recherche_id: l.recherche_id, type: 'mandat',
          titre: `⏰ ${qui} n’a pas signé dans les 15 jours`,
          description: `Mandat n° ${l.numero}, signé par ${premier} le ${l.signe_le ? dateCourte(l.signe_le) : '—'}. Il continue avec ${premier}. Renvoie-lui un nouveau lien, ou clos l'invitation (fenêtre « Mandat de recherche »).`,
          metadata: { signature_id: l.id, cosignataire_id: co.id },
        }));
        await ecritServeur('La relance', sb.from('relances').insert({
          client_id: l.client_id, recherche_id: l.recherche_id, type: 'rappel_client', statut: 'en_attente', date_echeance: new Date().toISOString(),
          note: `${qui} n'a pas signé le mandat n° ${l.numero} dans les 15 jours : nouveau lien ou invitation close ?`,
        }));
        await envoyerMail({
          a: ALERTES(), deLaPartDe: 'crm',
          sujet: `⏰ ${qui} n'a pas signé le mandat de ${premier} (n° ${l.numero})`,
          texte: `Le lien de ${qui} a expiré sans signature. Le mandat n° ${l.numero} continue avec ${premier}.\n\nÀ toi de choisir, dans la fenêtre « Mandat de recherche » de sa fiche : lui renvoyer un nouveau lien, ou clore l'invitation.\n\n${lienCrm}`,
          html: gabarit(`${qui} n’a pas signé`, `<p>Le lien de <b>${echappe(qui)}</b> a expiré sans signature. Le mandat <b>n° ${echappe(l.numero)}</b> continue avec ${echappe(premier)}.</p>
            <p>À toi de choisir, dans la fenêtre « Mandat de recherche » de sa fiche : lui renvoyer un nouveau lien, ou clore l’invitation.</p>
            <a href="${lienCrm}" style="display:inline-block;margin-top:8px;background:#c9a84c;color:#1a2332;text-decoration:none;padding:11px 16px;border-radius:10px;font-weight:800">Ouvrir la fiche</a>`),
        });
        bilan.push(`${qui} : délai dépassé`);
        continue;
      }

      const rappel: 0 | 1 | 2 = co.relances === 0 && age >= 2 * JOUR ? 1 : co.relances === 1 && age >= 7 * JOUR ? 2 : 0;
      if (!rappel) continue;
      const r = await inviter(sb, co, l, { rappel });
      bilan.push(`${qui} : rappel ${rappel}${r.erreur ? ` (⚠️ ${r.erreur})` : ''}`);
      if (rappel === 2) {
        await envoyerMail({
          a: ALERTES(), deLaPartDe: 'crm',
          sujet: `⏳ ${qui} n'a toujours pas signé le mandat de ${premier} (n° ${l.numero})`,
          texte: `${qui} a reçu son lien il y a 7 jours et n'a pas encore signé. Un second rappel vient de partir. Un coup de fil à ${premier} peut aider.\n\n${lienCrm}`,
          html: gabarit(`${qui} n’a pas encore signé`, `<p><b>${echappe(qui)}</b> a reçu son lien il y a 7 jours et n’a pas encore signé. Un second rappel vient de partir.</p>
            <p>Un coup de fil à ${echappe(premier)} peut aider.</p>
            <a href="${lienCrm}" style="display:inline-block;margin-top:8px;background:#c9a84c;color:#1a2332;text-decoration:none;padding:11px 16px;border-radius:10px;font-weight:800">Ouvrir la fiche</a>`),
        });
      }
    } catch (e) {
      bilan.push(`${co.id} : ${e instanceof Error ? e.message : 'erreur'}`);
    }
  }
  bilan.push(...await relancerDocuments(sb));
  return NextResponse.json({ ok: true, bilan, archive, reprise });
}

async function relancerDocuments(sb: SupabaseClient): Promise<string[]> {
  const bilan: string[] = [];
  const { data, error } = await sb.from('documents_signataires').select('*').eq('statut', 'invite');
  /* Table absente (SQL pas encore lancé) : rien à faire. */
  if (error) return [];
  const docs = new Map<string, SD.DocSigne | null>();
  for (const s of (data || []) as SD.SigDoc[]) {
    try {
      if (!docs.has(s.document_id)) {
        const { data: d } = await sb.from('documents').select('*').eq('id', s.document_id).maybeSingle();
        docs.set(s.document_id, (d as SD.DocSigne) || null);
      }
      const doc = docs.get(s.document_id);
      const m = doc ? modele(doc.modele) : null;
      if (!doc || !m || doc.statut !== 'pret' || !doc.signature || !s.invite_le) continue;
      const age = Date.now() - Date.parse(s.invite_le);
      const qui = SD.nomSig(s), nd = SD.nomDocument(m, doc.donnees);
      const lienCrm = SD.lienCrmDocument(doc);
      if (!SD.lienValide(s)) {
        if ((s.relances || 0) >= 3) continue;
        if (!(await ecritServeur('La marque de relance', sb.from('documents_signataires').update({ relances: 3 }).eq('id', s.id)))) continue;
        if (doc.client_id) {
          await ecritServeur('L’historique du client', sb.from('journal').insert({
            client_id: doc.client_id, type: 'mandat', metadata: { document_id: doc.id, signataire_id: s.id },
            titre: `⏰ ${qui} n’a pas signé dans les 15 jours`,
            description: `${doc.titre || m.titre} : son lien a expiré. Renvoie-lui un lien, ou arrête la signature (Documents, fiche du document).`,
          }));
          await ecritServeur('La relance', sb.from('relances').insert({
            client_id: doc.client_id, recherche_id: doc.recherche_id, type: 'rappel_client', statut: 'en_attente', date_echeance: new Date().toISOString(),
            note: `${qui} n'a pas signé ${nd.le} dans les 15 jours : nouveau lien, ou signature arrêtée ?`,
          }));
        }
        await envoyerMail({
          a: ALERTES(), deLaPartDe: 'crm',
          sujet: `⏰ ${qui} n'a pas signé ${nd.le}`,
          texte: `Le lien de ${qui} a expiré sans signature (${doc.titre || m.titre}).\n\nÀ toi de choisir, dans Documents (fiche du document) : lui renvoyer un lien, ou arrêter la signature.\n\n${lienCrm}`,
          html: gabarit(`${qui} n’a pas signé`, `<p>Le lien de <b>${echappe(qui)}</b> a expiré sans signature (${echappe(doc.titre || m.titre)}).</p>
            <p>À toi de choisir, dans Documents (fiche du document) : lui renvoyer un lien, ou arrêter la signature.</p>
            <a href="${lienCrm}" style="display:inline-block;margin-top:8px;background:#c9a84c;color:#1a2332;text-decoration:none;padding:11px 16px;border-radius:10px;font-weight:800">Ouvrir le CRM</a>`),
        });
        bilan.push(`${qui} (document) : délai dépassé`);
        continue;
      }
      const deja = s.relances || 0;
      const rappel: 0 | 1 | 2 = deja === 0 && age >= 2 * JOUR ? 1 : deja === 1 && age >= 7 * JOUR ? 2 : 0;
      if (!rappel) continue;
      const r = await SD.inviter(sb, s, m, doc.donnees, { rappel });
      bilan.push(`${qui} (document) : rappel ${rappel}${r.erreur ? ` (⚠️ ${r.erreur})` : ''}`);
      if (rappel === 2) {
        await envoyerMail({
          a: ALERTES(), deLaPartDe: 'crm',
          sujet: `⏳ ${qui} n'a toujours pas signé ${nd.le}`,
          texte: `${qui} a reçu son lien il y a 7 jours et n'a pas encore signé. Un dernier rappel vient de partir. Un coup de fil peut aider.\n\n${lienCrm}`,
          html: gabarit(`${qui} n’a pas encore signé`, `<p><b>${echappe(qui)}</b> a reçu son lien il y a 7 jours et n’a pas encore signé ${echappe(nd.le)}. Un dernier rappel vient de partir.</p>
            <p>Un coup de fil peut aider.</p>
            <a href="${lienCrm}" style="display:inline-block;margin-top:8px;background:#c9a84c;color:#1a2332;text-decoration:none;padding:11px 16px;border-radius:10px;font-weight:800">Ouvrir le CRM</a>`),
        });
      }
    } catch (e) {
      bilan.push(`${s.id} : ${e instanceof Error ? e.message : 'erreur'}`);
    }
  }
  return bilan;
}

/* ══ Le mandat proposé dans l'espace, pas encore signé (V3.32) ══════════════
   Alexandre a cliqué « Proposer au client » : l'acheteur voit « Votre mandat
   est prêt » dans son espace. S'il ne signe pas : un rappel 2 jours après la
   proposition, un second à 7 jours (au moins 3 jours après le premier), et
   Alexandre est prévenu avec le second. Rien au-delà.
   Sans colonne à ajouter : chaque rappel est une ligne du journal (type
   « mandat », `metadata.rappelMandat` = la date de la proposition). Une
   nouvelle proposition (« Mettre à jour ») repart de zéro. On ne relance ni
   une proposition de plus de 15 jours (celles d'avant ce rappel), ni une
   recherche qui a un mandat en route dans Documents (c'est lui qu'il signe),
   ni une recherche arrêtée ou fermée à l'espace. */
async function relancerPropositions(sb: SupabaseClient): Promise<string[]> {
  const bilan: string[] = [];
  const { data, error } = await sb.from('recherches').select('*').not('mandat_propose_le', 'is', null).is('mandat_date_signature', null).limit(300);
  /* Colonne absente (SQL du mandat en ligne pas lancé) : rien à faire. */
  if (error) return [];
  const site = process.env.NEXT_PUBLIC_SITE_URL || 'https://crm.emilio-immo.com';
  for (const r of (data || []) as Record<string, unknown>[]) {
    try {
      const rid = String(r.id), clientId = String(r.client_id || '');
      const proposeLe = String(r.mandat_propose_le || '');
      const t0 = Date.parse(proposeLe);
      if (!clientId || !Number.isFinite(t0) || r.espace_actif === false || r.active === false) continue;
      const age = Date.now() - t0;
      if (age < 2 * JOUR || age > 15 * JOUR) continue;
      const [sig, docs, faits] = await Promise.all([
        sb.from('mandats_signatures').select('id').eq('recherche_id', rid).in('statut', ['signe', 'partiel']).limit(1),
        sb.from('documents').select('id').eq('modele', 'mandat_recherche').eq('recherche_id', rid).in('statut', ['brouillon', 'pret', 'signe']).limit(1),
        sb.from('journal').select('created_at').eq('client_id', clientId).eq('type', 'mandat').eq('metadata->>rappelMandat', proposeLe).order('created_at', { ascending: false }),
      ]);
      if (sig.data?.length || docs.data?.length) continue;
      if (faits.error) { bilan.push(`${rid} : rappels illisibles (${faits.error.message})`); continue; }
      const n = (faits.data || []).length;
      const dernier = n ? Date.parse(String((faits.data || [])[0].created_at)) : 0;
      const rappel: 0 | 1 | 2 = n === 0 ? 1 : n === 1 && age >= 7 * JOUR && Date.now() - dernier >= 3 * JOUR ? 2 : 0;
      if (!rappel) continue;
      const { data: c } = await sb.from('clients').select('*').eq('id', clientId).maybeSingle();
      const client = c as { prenom?: string | null; nom?: string | null; emails?: unknown; token_espace?: string | null } | null;
      const emails = (Array.isArray(client?.emails) ? client!.emails as unknown[] : []).filter((e): e is string => typeof e === 'string' && e.includes('@'));
      const nom = `${client?.prenom || ''} ${client?.nom || ''}`.trim() || 'Le client';
      if (!client?.token_espace || !emails.length) { bilan.push(`${nom} : pas d'adresse ou pas d'espace, pas de rappel`); continue; }
      /* La marque d'abord : sans elle, le rappel repartirait demain. */
      if (!(await ecritServeur('Le rappel du mandat (historique)', sb.from('journal').insert({
        client_id: clientId, recherche_id: rid, type: 'mandat',
        titre: rappel === 1 ? '⏰ Rappel envoyé : son mandat de recherche l’attend' : '⏰ Second rappel envoyé : mandat pas encore signé',
        description: `Proposé dans son espace le ${dateCourte(proposeLe)}. Rappel automatique à ${emails.join(', ')}.`,
        metadata: { rappelMandat: proposeLe, rappel },
      })))) continue;
      const lien = `${lienEspace(client.token_espace, site)}?r=${encodeURIComponent(rid)}&mandat=1`;
      const prenom = client.prenom || '';
      const sujet = rappel === 1 ? 'Votre mandat de recherche vous attend' : 'Votre mandat de recherche, pour organiser vos visites';
      const phrase = rappel === 1
        ? `Votre mandat de recherche est prêt dans votre espace depuis le ${dateCourte(proposeLe)}. Il se relit et se signe en deux minutes, avec un code reçu par e-mail.`
        : 'Je reviens vers vous au sujet de votre mandat de recherche : c’est lui qui me permet d’organiser vos visites et de vous accompagner jusqu’à la signature. Il vous attend dans votre espace, deux minutes suffisent.';
      const erreur = await envoyerMail({
        a: emails[0], nomA: nom, repondreA: 'agence@emilio-immo.com', sujet,
        texte: `Bonjour ${prenom},\n\n${phrase.replace(/’/g, "'")}\n\nLire et signer mon mandat : ${lien}\n\nUne question avant de signer ? Répondez simplement à ce message.\n\nAlexandre Rogelet — Emilio Immobilier`,
        html: gabarit('Votre mandat de recherche', `<p>Bonjour ${echappe(prenom)},</p>
          <p>${echappe(phrase)}</p>
          <p><a href="${lien}" style="display:inline-block;margin:6px 0 4px;background:#c9a84c;color:#1a2332;text-decoration:none;padding:13px 22px;border-radius:12px;font-weight:800;font-size:15px">Lire et signer mon mandat</a></p>
          <p style="font-size:13px;color:#64748b">Une question avant de signer&nbsp;? Répondez simplement à ce message.</p>
          <p>Alexandre Rogelet — Emilio Immobilier</p>`),
      });
      bilan.push(`${nom} : rappel du mandat ${rappel}${erreur ? ` (⚠️ ${erreur})` : ''}`);
      if (rappel === 2) {
        const lienCrm = `${CRM()}/?page=fiche&client=${encodeURIComponent(clientId)}`;
        await envoyerMail({
          a: ALERTES(), deLaPartDe: 'crm',
          sujet: `⏳ ${nom} n'a toujours pas signé son mandat de recherche`,
          texte: `Le mandat proposé dans son espace le ${dateCourte(proposeLe)} n'est pas signé. Un second rappel vient de partir. Un coup de fil peut aider.\n\n${lienCrm}`,
          html: gabarit(`${nom} n’a pas encore signé`, `<p>Le mandat de recherche proposé dans son espace le <b>${echappe(dateCourte(proposeLe))}</b> n’est pas signé. Un second rappel vient de partir.</p>
            <p>Un coup de fil peut aider.</p>
            <a href="${lienCrm}" style="display:inline-block;margin-top:8px;background:#c9a84c;color:#1a2332;text-decoration:none;padding:11px 16px;border-radius:10px;font-weight:800">Ouvrir la fiche</a>`),
        });
      }
    } catch (e) {
      bilan.push(`${String(r.id)} : ${e instanceof Error ? e.message : 'erreur'}`);
    }
  }
  return bilan;
}
