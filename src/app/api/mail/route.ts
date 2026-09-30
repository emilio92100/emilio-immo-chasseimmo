import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { lireIdentiteAgence } from '@/lib/agence';
import { ecritServeur } from '@/lib/ecritures';
import { CLES_MAIL, conseillerDe } from '@/lib/mail-variables';
import {
  habillageDe, htmlVersTexte, htmlVide, mailLibreHtml, nettoyerHtml, personnaliserHtml, personnaliserObjet, personnaliserTexte, texteLiens,
  type LienPiece, type StyleMail,
} from '@/lib/mail-libre';

/**
 * « Nouveau mail » (V3.41) : un mail écrit à la main, à des contacts du CRM
 * et/ou à des adresses libres. Protégée par le code d'accès, comme le reste
 * du CRM (src/proxy.ts).
 *
 *   POST { action: 'depot', ext }   →  { ok, chemin, jeton }
 *        une pièce jointe part directement du navigateur vers le stockage
 *        privé (bucket « mandats », dossier mails/), comme les documents
 *   POST { action: 'envoyer', contacts, adresses, objet, html, style, pieces }
 *        →  { ok, envoyes, echecs, avertissements, mode }
 *
 * Un mail par destinataire, au nom d'Alexandre, {{prénom}} remplacé pour
 * chacun. Le HTML de l'éditeur est nettoyé ici aussi (src/lib/mail-libre.ts) :
 * le serveur ne fait confiance qu'à ce qu'il a lui-même filtré. Jusqu'à 10 Mo,
 * les pièces sont jointes ; au-delà, le mail porte des liens valables 7 jours.
 *
 * Ensuite, pour chaque contact du CRM (choisi dans la liste, ou retrouvé par
 * son adresse) : une ligne dans `envois` et une dans son Suivi (`journal`),
 * rangées dans sa recherche ouverte s'il en a une. Une adresse hors CRM ne
 * laisse pas de trace : il n'y a pas de fiche où la ranger.
 */

export const runtime = 'nodejs';
export const maxDuration = 60;

const BUCKET = 'mandats';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const CHEMIN = /^mails\/\d{4}-\d{2}\/[a-z0-9]{6,32}-\d+\.[a-z0-9]{2,5}$/;
const TYPES_PIECES: Record<string, string> = {
  pdf: 'application/pdf', jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp', heic: 'image/heic',
  doc: 'application/msword', docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xls: 'application/vnd.ms-excel', xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', txt: 'text/plain',
};
const MAX_JOINTS = 10_000_000;
const LIENS_JOURS = 7;
const MAX_DEST = 30;
const SITE = process.env.NEXT_PUBLIC_SITE_URL || 'https://emilio-immo-chasseimmo.vercel.app';
const FROM_EMAIL = process.env.MAILJET_FROM_EMAIL || 'arogelet@emilio-immo.com';
const FROM_NAME = process.env.MAILJET_FROM_NAME || 'Alexandre ROGELET — Emilio Immobilier';

const ko = (erreur: string, status = 400) => NextResponse.json({ ok: false, erreur }, { status });
const nomPropre = (n: string) => String(n || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  .replace(/[^A-Za-z0-9._ -]+/g, '-').replace(/\s+/g, ' ').trim().slice(0, 120) || 'document';

type Dest = { a: string[]; nom: string; prenom: string; famille: string; reference: string; clientId: string | null };
type Contact = { id: string; prenom: string | null; nom: string | null; reference: string | null; emails: string[] | null };

async function mailjet(o: { a: { email: string; nom: string }[]; sujet: string; texte: string; html: string; pj: { nom: string; type: string; base64: string }[]; id: string }): Promise<string | null> {
  const k = process.env.MAILJET_API_KEY, s = process.env.MAILJET_API_SECRET;
  if (!k || !s) return 'Mailjet non configuré';
  try {
    const r = await fetch('https://api.mailjet.com/v3.1/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Basic ${Buffer.from(`${k}:${s}`).toString('base64')}` },
      body: JSON.stringify({
        Messages: [{
          From: { Email: FROM_EMAIL, Name: FROM_NAME },
          To: o.a.map(x => ({ Email: x.email, ...(x.nom ? { Name: x.nom } : {}) })),
          Subject: o.sujet, TextPart: o.texte, HTMLPart: o.html, CustomID: o.id,
          ...(o.pj.length ? { Attachments: o.pj.map(p => ({ ContentType: p.type, Filename: p.nom, Base64Content: p.base64 })) } : {}),
          TrackOpens: 'disabled', TrackClicks: 'disabled',
        }],
      }),
    });
    const j = await r.json().catch(() => null) as { Messages?: { Status?: string; Errors?: { ErrorMessage?: string }[] }[] } | null;
    if (r.ok && j?.Messages?.[0]?.Status === 'success') return null;
    return j?.Messages?.[0]?.Errors?.[0]?.ErrorMessage || `Mailjet ${r.status}`;
  } catch (e) {
    return (e as Error).message || 'envoi impossible';
  }
}

export async function POST(req: NextRequest) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const cle = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !cle) return ko('Variables Supabase manquantes', 500);
  const sb = createClient(url, cle, { auth: { persistSession: false } });

  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return ko('Requête illisible'); }
  const action = String(body.action || '');

  try {
    /* ── Une pièce jointe : un droit de dépôt, pour un seul fichier ── */
    if (action === 'depot') {
      const ext = String(body.ext || '').toLowerCase().replace(/[^a-z0-9]/g, '');
      if (!TYPES_PIECES[ext]) return ko('Format refusé : PDF, image, Word, Excel ou texte.');
      const mois = new Date().toISOString().slice(0, 7);
      const hasard = Math.random().toString(36).slice(2, 12).padEnd(8, '0');
      const chemin = `mails/${mois}/${hasard}-${Date.now()}.${ext === 'jpeg' ? 'jpg' : ext}`;
      const { data, error } = await sb.storage.from(BUCKET).createSignedUploadUrl(chemin);
      if (error || !data) return ko(error?.message || 'Dépôt impossible', 500);
      return NextResponse.json({ ok: true, chemin: data.path, jeton: data.token });
    }

    if (action !== 'envoyer') return ko('Action inconnue');

    /* ── Ce qu'Alexandre a écrit ── */
    const objet = String(body.objet || '').replace(/\s+/g, ' ').trim().slice(0, 200);
    const corps = nettoyerHtml(String(body.html || ''));
    const style: StyleMail = body.style === 'emilio' ? 'emilio' : 'simple';
    if (!objet) return ko('L’objet est vide.');
    if (htmlVide(corps)) return ko('Le message est vide.');

    const ids = (Array.isArray(body.contacts) ? body.contacts : []).map(String).filter(x => UUID.test(x)).slice(0, MAX_DEST);
    const libres = (Array.isArray(body.adresses) ? body.adresses : []).map(x => String(x).trim().toLowerCase())
      .filter((x, i, l) => MAIL.test(x) && l.indexOf(x) === i).slice(0, MAX_DEST);
    if (!ids.length && !libres.length) return ko('Aucun destinataire.');

    /* ── Les destinataires : les contacts choisis (toutes leurs adresses),
          puis les adresses tapées — rattachées à leur contact si le CRM le
          connaît, pour le prénom et le Suivi. ── */
    const avertissements: string[] = [];
    const echecs: string[] = [];
    const dests: Dest[] = [];
    const deja = new Set<string>();
    const nomDe = (c: Contact) => `${c.prenom || ''} ${c.nom || ''}`.trim();
    if (ids.length) {
      const { data, error } = await sb.from('clients').select('id, prenom, nom, reference, emails').in('id', ids);
      if (error) return ko(`Les contacts n’ont pas pu être lus : ${error.message}`, 500);
      for (const c of (data || []) as Contact[]) {
        const a = (c.emails || []).map(e => String(e).trim().toLowerCase()).filter(e => MAIL.test(e) && !deja.has(e));
        if (!a.length) { echecs.push(`${nomDe(c) || 'Un contact'} (pas d’adresse e-mail)`); continue; }
        a.forEach(e => deja.add(e));
        dests.push({ a, nom: nomDe(c), prenom: c.prenom || '', famille: c.nom || '', reference: c.reference || '', clientId: c.id });
      }
    }
    const aChercher = libres.filter(e => !deja.has(e));
    const connus: Record<string, Contact> = {};
    if (aChercher.length) {
      const { data, error } = await sb.from('clients').select('id, prenom, nom, reference, emails').overlaps('emails', aChercher);
      if (error) console.error('[mail] contacts par adresse', error.message);
      for (const c of (data || []) as Contact[]) {
        for (const e of c.emails || []) { const k = String(e).trim().toLowerCase(); if (aChercher.includes(k) && !connus[k]) connus[k] = c; }
      }
    }
    for (const e of aChercher) {
      deja.add(e);
      const c = connus[e];
      dests.push(c
        ? { a: [e], nom: nomDe(c), prenom: c.prenom || '', famille: c.nom || '', reference: c.reference || '', clientId: c.id }
        : { a: [e], nom: '', prenom: '', famille: '', reference: '', clientId: null });
    }
    if (!dests.length) return ko(`Personne à qui l’envoyer : ${echecs.join(' · ')}`);

    /* ── L'habillage : le nom et le téléphone des Paramètres, l'identité de l'agence ── */
    const [reglages, identite] = await Promise.all([
      sb.from('parametres').select('cle, valeur').in('cle', CLES_MAIL),
      lireIdentiteAgence(sb),
    ]);
    const params = Object.fromEntries(((reglages.data || []) as { cle: string; valeur: string | null }[]).map(r => [r.cle, r.valeur || '']));
    const conseiller = conseillerDe(params);
    const h = habillageDe(params, identite, SITE);

    /* ── Les pièces jointes, lues dans le stockage privé ── */
    const pieces = (Array.isArray(body.pieces) ? body.pieces : []).slice(0, 15).map((x: unknown) => {
      const o = (x && typeof x === 'object' ? x : {}) as Record<string, unknown>;
      return { chemin: String(o.chemin || ''), nom: nomPropre(String(o.nom || '')) };
    });
    if (pieces.some((p: { chemin: string }) => !CHEMIN.test(p.chemin))) return ko('Une pièce jointe est introuvable : ajoute-la à nouveau.');
    const fichiers: { nom: string; type: string; octets: Buffer; chemin: string }[] = [];
    for (const p of pieces) {
      const { data, error } = await sb.storage.from(BUCKET).download(p.chemin);
      if (error || !data) return ko(`« ${p.nom} » n’a pas été trouvée : ajoute-la à nouveau.`, 404);
      const ext = (p.chemin.split('.').pop() || '').toLowerCase();
      const nom = /\.[a-z0-9]{2,5}$/i.test(p.nom) ? p.nom : `${p.nom}.${ext}`;
      fichiers.push({ nom, type: TYPES_PIECES[ext] || 'application/octet-stream', octets: Buffer.from(await data.arrayBuffer()), chemin: p.chemin });
    }
    const total = fichiers.reduce((t, f) => t + f.octets.length, 0);
    const mode: 'pj' | 'liens' = total <= MAX_JOINTS ? 'pj' : 'liens';
    const pj = mode === 'pj' ? fichiers.map(f => ({ nom: f.nom, type: f.type, base64: f.octets.toString('base64') })) : [];
    const liens: LienPiece[] = [];
    if (mode === 'liens') {
      for (const f of fichiers) {
        const { data, error } = await sb.storage.from(BUCKET).createSignedUrl(f.chemin, LIENS_JOURS * 86_400, { download: f.nom });
        if (error || !data) return ko(`Le lien de « ${f.nom} » n’a pas pu être créé.`, 500);
        liens.push({ nom: f.nom, url: data.signedUrl, taille: f.octets.length });
      }
    }
    const noms = fichiers.map(f => f.nom);

    /* ── La recherche où ranger l'envoi, pour les contacts qui en ont une :
          la première dont la veille tourne, sinon la première (comme
          /api/send-mail). ── */
    const clientIds = Array.from(new Set(dests.map(d => d.clientId).filter((x): x is string => !!x)));
    const dossier: Record<string, string | null> = {};
    if (clientIds.length) {
      const { data: rs } = await sb.from('recherches').select('id, client_id, active, created_at').in('client_id', clientIds).order('created_at', { ascending: true });
      for (const id of clientIds) {
        const siennes = (rs || []).filter((r: { client_id: string }) => r.client_id === id) as { id: string; active: boolean | null }[];
        dossier[id] = (siennes.find(r => r.active !== false) || siennes[0])?.id || null;
      }
    }

    /* ── L'envoi : un mail par destinataire ── */
    const texteBrut = htmlVersTexte(corps);
    const envoyes: { nom: string; a: string[]; clientId: string | null }[] = [];
    for (const d of dests) {
      const pour = { prenom: d.prenom, nom: d.famille, reference: d.reference };
      const sujet = personnaliserObjet(objet, pour, conseiller) || objet;
      const html = mailLibreHtml({ style, corps: personnaliserHtml(corps, pour, conseiller), h, liens, jours: LIENS_JOURS });
      const texte = `${personnaliserTexte(texteBrut, pour, conseiller)}${texteLiens(liens, LIENS_JOURS)}`;
      const err = await mailjet({ a: d.a.map(email => ({ email, nom: d.nom })), sujet, texte, html, pj, id: `mail-${d.clientId || 'libre'}-${Date.now()}` });
      if (err) { echecs.push(`${d.nom || d.a[0]} (${err})`); continue; }
      envoyes.push({ nom: d.nom, a: d.a, clientId: d.clientId });

      /* La trace, pour un contact du CRM : l'envoi, et son Suivi. */
      if (d.clientId) {
        const rid = dossier[d.clientId] || null;
        await ecritServeur('L’envoi (communications)', sb.from('envois').insert({
          client_id: d.clientId, recherche_id: rid, type: 'mail_libre', objet: sujet, corps: texte,
          destinataires: d.a, biens_ids: [], sms_envoye: false,
        }), avertissements);
        await ecritServeur('Le Suivi du contact', sb.from('journal').insert({
          client_id: d.clientId, recherche_id: rid, type: 'mail_envoye',
          titre: `✉️ Mail envoyé — ${sujet}`,
          description: `À : ${d.a.join(', ')}\n\n${texte}${noms.length ? `\n\n${mode === 'pj' ? 'Pièces jointes' : `Liens de téléchargement (${LIENS_JOURS} jours)`} : ${noms.join(', ')}` : ''}`,
          metadata: { source: 'nouveau_mail', style, pieces: noms },
        }), avertissements);
      }
    }
    if (!envoyes.length) return ko(`Le mail n’est pas parti : ${echecs.join(' · ')}`, 502);
    return NextResponse.json({ ok: true, envoyes, echecs, avertissements, mode });
  } catch (e) {
    return ko((e as Error).message || 'Erreur', 500);
  }
}
