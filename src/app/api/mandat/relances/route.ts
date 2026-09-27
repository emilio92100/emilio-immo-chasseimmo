import { NextRequest, NextResponse } from 'next/server';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { dateCourte } from '@/lib/mandat';
import { inviter, nomDe, lienValide, type Co, type LigneMandat } from '@/lib/cosignature';
import { envoyerMail, gabarit, echappe, ALERTES, CRM } from '@/lib/mandat-serveur';
import { modele } from '@/lib/actes';
import * as SD from '@/lib/signature-documents';

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
  const { data, error } = await sb.from('mandats_cosignataires').select('*').eq('statut', 'invite');
  /* Table absente (SQL pas encore lancé) : rien à faire. */
  if (error) return NextResponse.json({ ok: true, rien: error.message });

  const bilan: string[] = [];
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
        await sb.from('mandats_cosignataires').update({ relances: 3 }).eq('id', co.id);
        await sb.from('journal').insert({
          client_id: l.client_id, recherche_id: l.recherche_id, type: 'mandat',
          titre: `⏰ ${qui} n’a pas signé dans les 15 jours`,
          description: `Mandat n° ${l.numero}, signé par ${premier} le ${l.signe_le ? dateCourte(l.signe_le) : '—'}. Il continue avec ${premier}. Renvoie-lui un nouveau lien, ou clos l'invitation (fenêtre « Mandat de recherche »).`,
          metadata: { signature_id: l.id, cosignataire_id: co.id },
        });
        await sb.from('relances').insert({
          client_id: l.client_id, recherche_id: l.recherche_id, type: 'rappel_client', statut: 'en_attente', date_echeance: new Date().toISOString(),
          note: `${qui} n'a pas signé le mandat n° ${l.numero} dans les 15 jours : nouveau lien ou invitation close ?`,
        });
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
  return NextResponse.json({ ok: true, bilan });
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
        await sb.from('documents_signataires').update({ relances: 3 }).eq('id', s.id);
        if (doc.client_id) {
          await sb.from('journal').insert({
            client_id: doc.client_id, type: 'mandat', metadata: { document_id: doc.id, signataire_id: s.id },
            titre: `⏰ ${qui} n’a pas signé dans les 15 jours`,
            description: `${doc.titre || m.titre} : son lien a expiré. Renvoie-lui un lien, ou arrête la signature (Documents, fiche du document).`,
          });
          await sb.from('relances').insert({
            client_id: doc.client_id, recherche_id: doc.recherche_id, type: 'rappel_client', statut: 'en_attente', date_echeance: new Date().toISOString(),
            note: `${qui} n'a pas signé ${nd.le} dans les 15 jours : nouveau lien, ou signature arrêtée ?`,
          });
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
