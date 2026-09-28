/* ═══ L'archive du registre des mandats (V3.18) — serveur uniquement ═════
   Une photo datée du registre, hors du CRM : le PDF complet (lignes,
   observations, résultat de la vérification), rangé dans le stockage privé
   (mandats/registre/) et envoyé par e-mail à Alexandre. La boîte mail date
   la réception : si un jour on doute du registre, on compare avec les
   archives passées. Le 1er de chaque mois, par l'envoi quotidien des
   relances (/api/mandat/relances) ; à la demande, depuis le registre
   (/api/registre/archive). */

import type { SupabaseClient } from '@supabase/supabase-js';
import { lireIdentiteAgence } from './agence';
import { envoyerMail, gabarit, echappe, ALERTES, CRM } from './mandat-serveur';
import { lireDepart, quandRegistre, toutLire, type LigneRegistre, type ObsRegistre, type Probleme } from './registre';
import { pdfRegistre } from './registre-pdf';

const BUCKET = 'mandats';
const moisParis = (d = new Date()) => new Intl.DateTimeFormat('fr-CA', { timeZone: 'Europe/Paris', year: 'numeric', month: '2-digit' }).format(d);
const jourParis = (d = new Date()) => new Intl.DateTimeFormat('fr-CA', { timeZone: 'Europe/Paris' }).format(d);

export type Archive = { ok: boolean; rien?: string; deja?: boolean; chemin?: string; lignes?: number; problemes?: number; mail?: string | null; erreur?: string };

/* `mensuelle` : ne fait rien si l'archive du mois est déjà là. */
export async function archiverRegistre(sb: SupabaseClient, o: { mensuelle?: boolean } = {}): Promise<Archive> {
  const { depart, absent, erreur } = await lireDepart(sb);
  if (erreur) return { ok: false, erreur };
  if (absent || !depart) return { ok: true, rien: 'registre pas démarré' };
  const mois = moisParis();
  if (o.mensuelle) {
    const { data: deja } = await sb.storage.from(BUCKET).list('registre', { limit: 200, search: `archive-${mois}` });
    if (deja?.some(f => f.name.startsWith(`archive-${mois}`))) return { ok: true, deja: true };
  }
  const [l, ob, ve, identite] = await Promise.all([
    toutLire<LigneRegistre>((de, a) => sb.from('registre_mandats').select('*').order('numero').range(de, a)),
    toutLire<ObsRegistre>((de, a) => sb.from('registre_observations').select('*').order('rang').range(de, a)),
    sb.rpc('registre_verifier'),
    lireIdentiteAgence(sb),
  ]);
  /* Une archive incomplète ne part pas : elle dirait « intact » sur une partie. */
  if (l.erreur || ob.erreur) return { ok: false, erreur: (l.erreur || ob.erreur)! };
  const lignes = l.data;
  const obs = ob.data;
  const problemes = ve.error ? [{ quoi: 'verification', numero: null, probleme: `La vérification n’a pas pu se faire : ${ve.error.message}` }] : ((ve.data || []) as Probleme[]);
  const editeLe = new Date().toISOString();
  const pdf = await pdfRegistre({ depart, lignes, obs, problemes, identite, editeLe });
  const heure = new Intl.DateTimeFormat('fr-FR', { timeZone: 'Europe/Paris', hour: '2-digit', minute: '2-digit' }).format(new Date()).replace(':', 'h');
  const chemin = `registre/archive-${jourParis()}-${heure}.pdf`;
  const up = await sb.storage.from(BUCKET).upload(chemin, pdf, { contentType: 'application/pdf', upsert: false });
  if (up.error) return { ok: false, erreur: 'Le PDF n’a pas pu être rangé : ' + up.error.message };
  const ok = problemes.length === 0;
  const etat = ok ? 'Vérification : intact. Les numéros se suivent et aucune ligne n’a été retouchée.' : `⚠️ Vérification : ${problemes.length} anomalie${problemes.length > 1 ? 's' : ''} — ${problemes.map(p => `${p.numero ? `n° ${p.numero} : ` : ''}${p.probleme}`).join(' ; ')}`;
  const quand = quandRegistre(editeLe);
  const mail = await envoyerMail({
    a: ALERTES(), deLaPartDe: 'crm',
    sujet: `Registre des mandats — archive du ${quandRegistre(editeLe, false)}`,
    pj: [{ nom: `registre-des-mandats-${jourParis()}.pdf`, type: 'application/pdf', base64: Buffer.from(pdf).toString('base64') }],
    texte: `Ton registre des mandats, tel qu'il était le ${quand} : ${lignes.length} mandat${lignes.length > 1 ? 's' : ''} inscrit${lignes.length > 1 ? 's' : ''}.\n${etat}\n\nGarde ce mail : il date la photo de ton registre, hors du CRM. En cas de contrôle ou de litige, il prouve que rien n'a été réécrit depuis.\n\n${CRM()}/?page=registre`,
    html: gabarit('L’archive de ton registre des mandats',
      `<p>Ton registre des mandats, tel qu’il était le <b>${echappe(quand)}</b> : ${lignes.length} mandat${lignes.length > 1 ? 's' : ''} inscrit${lignes.length > 1 ? 's' : ''}.</p>
       <p style="color:${ok ? '#166534' : '#b91c1c'}"><b>${echappe(etat)}</b></p>
       <p>Garde ce mail : il date la photo de ton registre, hors du CRM. En cas de contrôle ou de litige, il prouve que rien n’a été réécrit depuis.</p>
       <a href="${CRM()}/?page=registre" style="display:inline-block;margin-top:8px;background:#c9a84c;color:#1a2332;text-decoration:none;padding:11px 16px;border-radius:10px;font-weight:800">Ouvrir le registre</a>`),
  });
  return { ok: true, chemin, lignes: lignes.length, problemes: problemes.length, mail };
}

/* Le 1er du mois, heure de Paris : l'archive mensuelle. */
export const premierDuMois = () => jourParis().endsWith('-01');
