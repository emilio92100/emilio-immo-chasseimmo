import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { envoyerMailjet } from '@/lib/point-auto';
import { TABLE_DEMANDES, robot, type DemandeSite } from '@/lib/demandes-site';
import { alerteDemandeCoupee, mailDemande } from '@/lib/demandes-site-mail';
import { CLE_ALERTES } from '@/lib/alertes';

/* ═══ « Nouvelle demande du site » : le mail à Alexandre (V3.37) ═══════════
   Le site, après chaque formulaire, appelle la fonction send-contact-email du
   projet Supabase du CRM ; elle appelle cette route. Aucune clé à fournir :
   la route ne reçoit rien et ne croit personne. Elle lit elle-même les
   demandes pas encore annoncées (notifie_le vide, reçues depuis moins de
   deux jours), se réserve chacune (mise à jour sous condition « encore
   vide »), puis envoie le mail par Mailjet, avec les réglages du CRM.
   L'appeler mille fois n'envoie rien de plus : c'est pour ça qu'elle peut
   être publique (src/proxy.ts).

   Un robot (src/lib/demandes-site.ts, robot()) est marqué annoncé sans mail.
   Un envoi raté remet la demande « à annoncer » : le prochain appel réessaie. */

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

const DESTINATAIRE = () => process.env.DEMANDES_EMAIL || process.env.ALERTES_EMAIL || process.env.MAILJET_FROM_EMAIL || 'arogelet@emilio-immo.com';

async function traiter() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL, cle = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !cle) return NextResponse.json({ ok: false, erreur: 'configuration du serveur incomplète' }, { status: 500 });
  const sb = createClient(url, cle, { auth: { persistSession: false } });

  const depuis = new Date(Date.now() - 2 * 86_400_000).toISOString();
  const { data, error } = await sb.from(TABLE_DEMANDES).select('*')
    .is('notifie_le', null).gte('created_at', depuis).order('created_at', { ascending: true }).limit(10);
  if (error) {
    console.error('[demandes-site/notifier] lecture', error.message);
    return NextResponse.json({ ok: false, erreur: error.message }, { status: 500 });
  }

  /* V3.50 : le réglage des alertes (Paramètres › Alertes mail). Coupé, la
     demande est quand même marquée annoncée : elle est dans le CRM, et ne
     repartira pas d'un coup le jour où on rallume le mail. */
  let coupe = false;
  if (data && data.length) {
    const { data: r, error: eR } = await sb.from('parametres').select('valeur').eq('cle', CLE_ALERTES).maybeSingle();
    if (eR) console.error('[demandes-site/notifier] lecture du réglage', eR.message);
    else coupe = alerteDemandeCoupee((r as { valeur?: string | null } | null)?.valeur);
  }

  let envoyes = 0, robots = 0, coupees = 0;
  const erreurs: string[] = [];
  for (const d of (data || []) as DemandeSite[]) {
    /* Se réserver la demande : si un autre appel l'a prise entre-temps, la
       mise à jour ne touche rien et on passe. */
    const { data: pris, error: ePris } = await sb.from(TABLE_DEMANDES)
      .update({ notifie_le: new Date().toISOString() }).eq('id', d.id).is('notifie_le', null).select('id');
    if (ePris) { erreurs.push(ePris.message); continue; }
    if (!pris || !pris.length) continue;
    if (robot(d)) { robots++; continue; }
    if (coupe) { coupees++; continue; }

    const m = mailDemande(d);
    const r = await envoyerMailjet({ a: DESTINATAIRE(), sujet: m.sujet, html: m.html, texte: m.texte, id: `demande-${d.id}`, deNom: 'Site Emilio Immobilier' });
    if (r.ok) { envoyes++; continue; }
    erreurs.push(r.erreur || 'envoi raté');
    console.error('[demandes-site/notifier] envoi', d.id, r.erreur);
    /* Raté : la demande redevient « à annoncer », le prochain appel réessaie. */
    const { error: eRetour } = await sb.from(TABLE_DEMANDES).update({ notifie_le: null }).eq('id', d.id);
    if (eRetour) console.error('[demandes-site/notifier] remise à annoncer', d.id, eRetour.message);
  }
  return NextResponse.json({ ok: erreurs.length === 0, envoyes, robots, coupees, erreurs });
}

export async function POST() { return traiter(); }
