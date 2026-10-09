import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { ecritServeur } from '@/lib/ecritures';
import { lireRemise, type EtatRemise } from '@/lib/remise-mail';

/**
 * V3.151 — Le mail est-il arrivé ? Protégée par le code d'accès, comme le
 * reste du CRM (src/proxy.ts).
 *
 *   POST { remises: { id, email, nom?, objet?, clientId?, rechercheId? }[] }
 *        →  { ok, etats: { id, etat: 'remis' | 'refuse' | 'attente', raison, statut }[] }
 *
 * Une seule question à Mailjet par mail, sans attendre : c'est le navigateur
 * (SuiviRemises) qui la repose jusqu'à la réponse de la messagerie. Un mail
 * refusé est noté UNE fois dans le Suivi du contact (retrouvé par son adresse
 * quand l'envoi ne disait pas qui c'était) : « ❌ Mail non distribué ».
 */

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
type Demande = { id: string; email: string; objet: string; clientId: string | null; rechercheId: string | null };

export async function POST(req: NextRequest) {
  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return NextResponse.json({ ok: false, erreur: 'Requête illisible' }, { status: 400 }); }
  const l: Demande[] = (Array.isArray(body.remises) ? body.remises : []).slice(0, 40).map((x: unknown) => {
    const o = (x && typeof x === 'object' ? x : {}) as Record<string, unknown>;
    return {
      id: String(o.id || ''), email: String(o.email || '').trim().toLowerCase().slice(0, 200), objet: String(o.objet || '').slice(0, 200),
      clientId: UUID.test(String(o.clientId || '')) ? String(o.clientId) : null,
      rechercheId: UUID.test(String(o.rechercheId || '')) ? String(o.rechercheId) : null,
    };
  }).filter((x: Demande) => /^\d{1,30}$/.test(x.id));
  if (!l.length) return NextResponse.json({ ok: true, etats: [] });

  const etats = await Promise.all(l.map(async x => {
    try { return { id: x.id, ...(await lireRemise(x.id)) }; } catch { return { id: x.id, etat: 'attente' as EtatRemise, raison: '', statut: 'erreur' }; }
  }));

  /* Les refus, dans le Suivi du contact : une fois par mail. */
  const refuses = l.map((x, i) => ({ x, e: etats[i] })).filter(y => y.e.etat === 'refuse');
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL, cle = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (refuses.length && url && cle) {
    const sb = createClient(url, cle, { auth: { persistSession: false } });
    for (const { x, e } of refuses) {
      let clientId = x.clientId;
      if (!clientId && x.email) {
        const { data } = await sb.from('clients').select('id').overlaps('emails', [x.email]).limit(1);
        clientId = (data?.[0] as { id?: string } | undefined)?.id || null;
      }
      if (!clientId) continue;
      const { data: deja, error: eDeja } = await sb.from('journal').select('id').eq('client_id', clientId).eq('metadata->>remise', x.id).limit(1);
      if (eDeja || deja?.length) continue;
      await ecritServeur('Le Suivi du contact', sb.from('journal').insert({
        client_id: clientId, recherche_id: x.rechercheId, type: 'mail_envoye',
        titre: `❌ Mail non distribué${x.objet ? ` — ${x.objet}` : ''}`,
        description: `Il n’est pas arrivé chez ${x.email} : ${e.raison}. Vérifie l’adresse sur sa fiche avant de le renvoyer.`,
        metadata: { remise: x.id, statut: e.statut, email: x.email },
      }));
    }
  }
  return NextResponse.json({ ok: true, etats });
}
