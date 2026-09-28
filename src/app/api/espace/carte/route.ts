import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { placerAdresses, garderPositions, composerAdresse, cleAdresse, adresseUtile, decaler, type Position } from '@/lib/carte';
import { maintenantParis, visitePasseeParis } from '@/lib/visites';

/**
 * La carte de l'espace acheteur — /api/espace/carte?token=…  (V3.27)
 *
 * Le lien de la recherche fait l'identification, comme pour toutes les
 * routes de l'espace : on ne rend que les biens présentés à CETTE recherche.
 *
 * ⚠️ Ce que le client reçoit n'est jamais l'adresse d'un bien. Chaque bien
 * devient une petite zone ronde, de deux ou trois rues, dont le centre est
 * décalé d'une distance fixe dans une direction tirée de l'identifiant du
 * bien : toujours la même pour un même bien (recharger la page ne permet pas
 * de moyenner les positions), et l'immeuble est dans la zone sans jamais en
 * être le centre. Seule une visite calée, et pas encore passée, donne le
 * point exact — l'adresse figure déjà dans son rendez-vous.
 *
 * Une adresse cherchée une fois est gardée dans `geocodes`, comme pour la
 * carte du CRM (src/lib/carte.ts) : la clé du serveur y écrit.
 */

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

function base() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const cle = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
  return createClient(url, cle);
}

/* La taille d'une zone suit ce que l'on sait de l'adresse : le numéro, la
   rue, ou le quartier. La ville seule n'est pas dessinée. `r` : le rayon du
   cercle ; `d` : le décalage de son centre (toujours plus petit que `r`). */
const ZONE: Record<string, { r: number; d: number; niveau: 'adresse' | 'rue' | 'quartier' }> = {
  housenumber: { r: 115, d: 68, niveau: 'adresse' },
  street: { r: 170, d: 60, niveau: 'rue' },
  locality: { r: 340, d: 90, niveau: 'quartier' },
};

type LigneBien = {
  id: string; adresse: string | null; adresse_probable: string | null; quartier: string | null;
  ville: string | null; code_postal: string | null; bien_vente_id: string | null;
};

const arrondi = (x: number) => Math.round(x * 1e5) / 1e5;

export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get('token') || '';
  if (token.length < 12 || token.length > 128) {
    return NextResponse.json({ ok: false, error: 'lien invalide' }, { status: 400 });
  }
  const supabase = base();

  const { data: recherche } = await supabase
    .from('recherches').select('id, espace_actif').eq('token_espace', token).maybeSingle();
  if (!recherche || recherche.espace_actif === false) {
    return NextResponse.json({ ok: false, error: 'lien invalide' }, { status: 401 });
  }

  const [biensRes, visitesRes] = await Promise.all([
    supabase.from('biens').select('id, adresse, adresse_probable, quartier, ville, code_postal, bien_vente_id')
      .eq('recherche_id', recherche.id).eq('etape', 'presente'),
    supabase.from('visites').select('bien_id, date_visite, heure, statut')
      .eq('recherche_id', recherche.id).eq('statut', 'a_venir'),
  ]);
  if (biensRes.error) {
    return NextResponse.json({ ok: false, error: 'lecture impossible' }, { status: 500 });
  }
  const biens = (biensRes.data || []) as LigneBien[];

  /* Une visite calée et pas encore passée : son bien a droit au point exact. */
  const maintenant = maintenantParis();
  const visiteCalee = new Set(
    (visitesRes.data || []).filter(v => v.bien_id && v.date_visite && !visitePasseeParis(v, maintenant)).map(v => v.bien_id as string),
  );

  /* Un bien que l'agence vend elle-même : sa position choisie dans la liste
     d'adresses du CRM, quand elle existe, vaut mieux qu'une recherche. */
  const gpsVente = new Map<string, { lat: number; lng: number }>();
  const idsVente = biens.map(b => b.bien_vente_id).filter((x): x is string => !!x);
  if (idsVente.length) {
    const { data } = await supabase.from('biens_vente').select('id, gps:donnees->gps').in('id', idsVente);
    for (const v of (data || []) as { id: string; gps: { lat?: number; lon?: number; lng?: number } | null }[]) {
      const lat = Number(v.gps?.lat), lng = Number(v.gps?.lon ?? v.gps?.lng);
      if (Number.isFinite(lat) && Number.isFinite(lng) && lat && lng) gpsVente.set(v.id, { lat, lng });
    }
  }

  /* Pour chaque bien, les adresses à essayer, de la plus précise à la plus
     vague : l'adresse, l'adresse probable (la veille la déduit de l'annonce),
     puis le quartier. On passe à la suivante quand la précédente ne donne
     que la ville, ou rien. */
  const essais = new Map<string, string[]>();
  for (const b of biens) {
    if (b.bien_vente_id && gpsVente.has(b.bien_vente_id)) continue;
    const l = [b.adresse, b.adresse_probable, b.quartier]
      .filter(adresseUtile)
      .map(a => composerAdresse(a, b.code_postal, b.ville))
      .filter((a, i, t) => t.indexOf(a) === i);
    if (l.length) essais.set(b.id, l);
  }

  const trouve = new Map<string, Position>();
  let aEcrire: Parameters<typeof garderPositions>[1] = [];
  let tableAbsente = false;
  for (let tour = 0; tour < 3; tour++) {
    const demandes = new Map<string, string>();   // id du bien → adresse de ce tour
    for (const [id, l] of essais) if (!trouve.has(id) && l[tour]) demandes.set(id, l[tour]);
    if (!demandes.size) break;
    const res = await placerAdresses(supabase, [...demandes.values()]);
    tableAbsente ||= res.tableAbsente;
    aEcrire = aEcrire.concat(res.aEcrire);
    for (const [id, a] of demandes) {
      const p = res.positions.get(cleAdresse(a));
      if (p && ZONE[p.precision]) trouve.set(id, p);
    }
  }
  if (aEcrire.length && !tableAbsente) await garderPositions(supabase, aEcrire);

  const zones: { id: string; lng: number; lat: number; r: number; niveau: string; exact?: boolean }[] = [];
  const sans: string[] = [];
  for (const b of biens) {
    const gps = b.bien_vente_id ? gpsVente.get(b.bien_vente_id) : undefined;
    const p: Position | undefined = gps ? { ...gps, precision: 'housenumber', libelle: null } : trouve.get(b.id);
    const z = p && ZONE[p.precision];
    if (!p || !z) { sans.push(b.id); continue; }
    if (visiteCalee.has(b.id) && z.niveau !== 'quartier') {
      zones.push({ id: b.id, lng: arrondi(p.lng), lat: arrondi(p.lat), r: 40, niveau: z.niveau, exact: true });
      continue;
    }
    const [lng, lat] = decaler(p.lng, p.lat, `zone:${b.id}`, z.d);
    zones.push({ id: b.id, lng: arrondi(lng), lat: arrondi(lat), r: z.r, niveau: z.niveau });
  }

  return NextResponse.json({ ok: true, zones, sans }, { headers: { 'Cache-Control': 'private, no-store' } });
}
