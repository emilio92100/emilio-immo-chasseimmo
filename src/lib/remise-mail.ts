import { AsyncLocalStorage } from 'node:async_hooks';
import { NextResponse } from 'next/server';

/* ═══ Le mail est-il bien arrivé ? (V3.151) ═════════════════════════════════
   Alexandre : « depuis mon compte mail, quand l'adresse n'existe pas, j'ai un
   message d'erreur. Ici ? … un spinner qui permet de voir si ça a bien été
   envoyé, et sinon un message rouge, et que ça reste sur la même page ».

   Mailjet répond « accepté » tout de suite, puis tente la remise : c'est la
   messagerie du destinataire qui dit, quelques secondes plus tard, « cette
   adresse n'existe pas ». Ce refus revenait chez Mailjet, jamais au CRM : un
   mail perdu passait pour parti. Maintenant :
     · chaque route qui envoie (send-mail, mail, biens-vente, documents…) note
       les mails partis pendant son appel — `noterRemises`, sans rien changer à
       ses propres réponses — et `avecRemises` les ajoute à sa réponse JSON
       (`remise`) ;
     · le navigateur (SuiviRemises, AppLayout) les voit passer et demande
       /api/mail/remise jusqu'à la réponse de la messagerie : « Bien arrivé »,
       ou en rouge « Non distribué : adresse inconnue ».
   Le magasin des mails partis suit l'appel en cours (AsyncLocalStorage) :
   deux appels en même temps ne se mélangent pas. Hors d'une route qui le
   demande (les envois des clients depuis leur espace, les relances
   automatiques), `noterRemises` ne fait rien. */

export type Remise = {
  /* L'identifiant Mailjet du message (gardé en texte : il dépasse la
     précision d'un nombre JavaScript). */
  id: string; email: string; nom?: string; objet?: string;
  clientId?: string | null; rechercheId?: string | null;
};

const collecte = new AsyncLocalStorage<Remise[]>();

/* Les identifiants d'une réponse de l'API d'envoi (v3.1), message par
   message, destinataire par destinataire. On les lit dans `MessageHref`
   (« …/v3/REST/message/1152921… ») : `MessageID` est un nombre trop grand
   pour JavaScript, qui l'arrondirait. */
export function idsMailjet(j: unknown): { email: string; id: string }[][] {
  const l = (j as { Messages?: unknown[] } | null)?.Messages;
  if (!Array.isArray(l)) return [];
  return l.map(m => {
    const x = (m || {}) as { Status?: string; To?: { Email?: string; MessageHref?: string; MessageID?: unknown }[] };
    if (x.Status !== 'success' || !Array.isArray(x.To)) return [];
    return x.To.map(t => {
      const href = String(t?.MessageHref || '');
      const id = /\/message\/(\d+)\s*$/.exec(href)?.[1] || (typeof t?.MessageID === 'string' ? t.MessageID : '');
      return { email: String(t?.Email || '').trim().toLowerCase(), id };
    }).filter(t => t.id && t.email);
  });
}

/* Un mail vient de partir : on le garde pour la vérification. `n` : le rang
   du message dans la réponse (un envoi groupé en a plusieurs). */
export function noterRemises(j: unknown, info: Omit<Remise, 'id' | 'email'> = {}, n = 0) {
  const l = collecte.getStore();
  if (!l) return;
  for (const t of idsMailjet(j)[n] || []) l.push({ ...info, id: t.id, email: t.email });
}

/* Une route dont les mails sont suivis : sa réponse JSON reçoit `remise`. */
export async function avecRemises(f: () => Promise<Response>): Promise<Response> {
  const l: Remise[] = [];
  const r = await collecte.run(l, f);
  if (!l.length) return r;
  try {
    const corps = await r.clone().json();
    if (!corps || typeof corps !== 'object' || Array.isArray(corps)) return r;
    return NextResponse.json({ ...corps, remise: l }, { status: r.status });
  } catch {
    return r;
  }
}

/* ── Ce que dit la messagerie du destinataire ── */
export type EtatRemise = 'remis' | 'refuse' | 'attente';
/* Les raisons de Mailjet (StateID), en mots simples. */
const RAISONS: Record<number, string> = {
  1: 'adresse inconnue', 2: 'boîte mail désactivée', 3: 'boîte mail pleine', 4: 'nom de domaine invalide',
  5: 'ce domaine ne reçoit pas de mail', 6: 'refusé par la messagerie du destinataire', 7: 'expéditeur bloqué par le destinataire',
  8: 'contenu refusé par la messagerie du destinataire', 9: 'refusé par les règles de la messagerie du destinataire',
  10: 'panne chez la messagerie du destinataire', 11: 'panne chez la messagerie du destinataire', 12: 'messagerie du destinataire injoignable',
  13: 'la messagerie du destinataire fait patienter', 14: 'adresse bloquée : un mail précédent n’y est pas arrivé',
  16: 'bloqué comme indésirable', 19: 'faute de frappe dans l’adresse', 20: 'adresse sur liste noire',
  21: 'le destinataire a signalé un mail précédent comme indésirable',
};

export async function lireRemise(id: string): Promise<{ etat: EtatRemise; raison: string; statut: string }> {
  const k = process.env.MAILJET_API_KEY, s = process.env.MAILJET_API_SECRET;
  if (!k || !s || !/^\d+$/.test(id)) return { etat: 'attente', raison: '', statut: 'inconnu' };
  const r = await fetch(`https://api.mailjet.com/v3/REST/message/${id}`, {
    headers: { Authorization: `Basic ${Buffer.from(`${k}:${s}`).toString('base64')}` }, cache: 'no-store',
  });
  /* Juste après l'envoi, Mailjet ne connaît pas encore le message : patience. */
  if (!r.ok) return { etat: 'attente', raison: '', statut: r.status === 404 ? 'pas encore connu' : `Mailjet ${r.status}` };
  const j = await r.json().catch(() => null) as { Data?: { Status?: string; StateID?: number; StatePermanent?: boolean }[] } | null;
  const d = j?.Data?.[0];
  const statut = String(d?.Status || 'unknown');
  const raison = (d?.StateID && RAISONS[d.StateID]) || '';
  if (['sent', 'opened', 'clicked', 'spam', 'unsub'].includes(statut)) return { etat: 'remis', raison: '', statut };
  if (statut === 'hardbounced' || statut === 'blocked') return { etat: 'refuse', raison: raison || (statut === 'blocked' ? 'bloqué avant l’envoi' : 'adresse refusée'), statut };
  if (['bounce', 'softbounced', 'deferred'].includes(statut)) {
    return d?.StatePermanent ? { etat: 'refuse', raison: raison || 'refusé par la messagerie du destinataire', statut }
      : { etat: 'attente', raison: raison ? `${raison}, nouvel essai en cours` : 'nouvel essai en cours', statut };
  }
  return { etat: 'attente', raison: '', statut };
}
