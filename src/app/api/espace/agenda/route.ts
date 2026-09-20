import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

/**
 * Le rendez-vous de visite, au format agenda — /api/espace/agenda?token=…&v=…
 *
 * Le lien de l'espace fait office d'identification, comme partout ailleurs :
 * on ne rend le rendez-vous que s'il appartient bien à la recherche que ce
 * jeton désigne. Sans cette vérification, n'importe qui pourrait lire les
 * rendez-vous d'un autre client en changeant l'identifiant dans l'adresse.
 *
 * On renvoie un fichier .ics, que Google Agenda, Apple Calendrier et Outlook
 * savent tous ouvrir sans installer quoi que ce soit.
 */

export const dynamic = 'force-dynamic';

function base() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const cle = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
  return createClient(url, cle);
}

/* Un champ .ics n'accepte ni virgule, ni point-virgule, ni retour à la ligne bruts. */
const echappe = (t: string) =>
  String(t).replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');

/* « 2026-09-25 » + « 18:00 » → « 20260925T180000 », en heure locale. */
function horodatage(date: string, heure?: string | null) {
  const j = String(date).slice(0, 10).replace(/-/g, '');
  const h = (heure ? String(heure).slice(0, 5) : '10:00').replace(':', '') + '00';
  return j + 'T' + h;
}
function plusUneHeure(date: string, heure?: string | null) {
  const d = new Date(`${String(date).slice(0, 10)}T${heure ? String(heure).slice(0, 5) : '10:00'}:00`);
  d.setHours(d.getHours() + 1);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}T${p(d.getHours())}${p(d.getMinutes())}00`;
}

export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get('token') || '';
  const visiteId = req.nextUrl.searchParams.get('v') || '';
  if (token.length < 32 || !visiteId) {
    return NextResponse.json({ ok: false, error: 'lien invalide' }, { status: 400 });
  }

  const supabase = base();

  const { data: recherche } = await supabase
    .from('recherches')
    .select('id, espace_actif')
    .eq('token_espace', token)
    .maybeSingle();
  if (!recherche || recherche.espace_actif === false) {
    return NextResponse.json({ ok: false, error: 'lien invalide' }, { status: 401 });
  }

  // la visite doit appartenir à CETTE recherche
  const { data: visite } = await supabase
    .from('visites')
    .select('id, date_visite, heure, bien_id, contact_agence, commentaire')
    .eq('id', visiteId)
    .eq('recherche_id', recherche.id)
    .maybeSingle();
  if (!visite || !visite.date_visite) {
    return NextResponse.json({ ok: false, error: 'visite introuvable' }, { status: 404 });
  }

  const { data: bien } = visite.bien_id
    ? await supabase.from('biens')
        .select('titre, type_bien, ville, quartier, adresse, adresse_probable')
        .eq('id', visite.bien_id).maybeSingle()
    : { data: null };

  const titre = bien?.titre || `${bien?.type_bien || 'Bien'} — ${bien?.ville || ''}`;
  const lieu = [bien?.adresse || bien?.adresse_probable || bien?.quartier, bien?.ville]
    .filter(Boolean).join(', ');
  const details = [
    'Visite organisée par Emilio Immobilier.',
    visite.contact_agence ? `Contact sur place : ${visite.contact_agence}` : '',
    visite.commentaire || '',
    'Alexandre Rogelet · 06 58 95 76 32',
  ].filter(Boolean).join('\n');

  const ics = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Emilio Immobilier//Espace acheteur//FR',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:visite-${visite.id}@emilio-immo.com`,
    `DTSTAMP:${new Date().toISOString().replace(/[-:]/g, '').slice(0, 15)}Z`,
    `DTSTART:${horodatage(visite.date_visite, visite.heure)}`,
    `DTEND:${plusUneHeure(visite.date_visite, visite.heure)}`,
    `SUMMARY:${echappe('Visite — ' + titre)}`,
    lieu ? `LOCATION:${echappe(lieu)}` : '',
    `DESCRIPTION:${echappe(details)}`,
    'BEGIN:VALARM',
    'TRIGGER:-PT2H',
    'ACTION:DISPLAY',
    `DESCRIPTION:${echappe('Visite dans 2 heures — ' + titre)}`,
    'END:VALARM',
    'END:VEVENT',
    'END:VCALENDAR',
  ].filter(Boolean).join('\r\n');

  /* La norme veut des lignes de 75 octets maximum, repliées par un espace.
     La plupart des agendas tolèrent plus long, Outlook non : on replie. */
  const replie = ics.split('\r\n').map((l) => {
    if (l.length <= 74) return l;
    const bouts: string[] = [l.slice(0, 74)];
    let reste = l.slice(74);
    while (reste.length > 73) { bouts.push(' ' + reste.slice(0, 73)); reste = reste.slice(73); }
    if (reste) bouts.push(' ' + reste);
    return bouts.join('\r\n');
  }).join('\r\n');

  return new NextResponse(replie, {
    headers: {
      'Content-Type': 'text/calendar; charset=utf-8',
      'Content-Disposition': 'attachment; filename="visite-emilio.ics"',
      'Cache-Control': 'no-store',
    },
  });
}
