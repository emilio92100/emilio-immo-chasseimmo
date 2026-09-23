import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { lienEspace } from '@/lib/jeton';

/**
 * Ce que la notification doit dire.
 *
 * Appelée par public/sw.js au moment exact où le téléphone se réveille, donc
 * le texte est calculé à la seconde : si le client a ouvert ses biens entre
 * l'envoi et l'affichage, la notification le sait et ne ment pas.
 *
 * La serrure ici, c'est l'adresse de poussée elle-même : une URL de deux cents
 * caractères, tirée au hasard par Apple ou Google, que seul cet appareil
 * connaît. On ne renvoie jamais rien d'autre que ce que ce client-là peut voir.
 *
 * ⚠️ Pas de prix dans le texte : la notification s'affiche sur un écran
 * verrouillé, à la vue de qui passe à côté. Le bien, oui. Le budget, non.
 */

export const dynamic = 'force-dynamic';

const SITE = process.env.NEXT_PUBLIC_SITE_URL || 'https://emilio-immo-chasseimmo.vercel.app';

function base() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
}

type BienLite = {
  id: string; titre: string | null; type_bien: string | null;
  surface: number | null; nb_pieces: number | null;
  ville: string | null; quartier: string | null;
  recherche_id: string;
};

/* « 3 pièces · 68 m² · Boulogne-Billancourt » — de quoi reconnaître le bien
   d'un coup d'œil, sans rien dire de ce qui le regarde lui seul. */
function decrire(b: BienLite): string {
  const bouts = [
    b.nb_pieces ? `${b.nb_pieces} pièce${b.nb_pieces > 1 ? 's' : ''}` : (b.type_bien || ''),
    b.surface ? `${b.surface} m²` : '',
    b.quartier || b.ville || '',
  ].filter(Boolean);
  return bouts.length ? bouts.join(' · ') : (b.titre || 'Il vous attend dans votre espace.');
}

export async function POST(req: NextRequest) {
  const repli = {
    titre: 'Votre espace a du nouveau',
    corps: 'Ouvrez votre espace pour le découvrir.',
    url: SITE,
    pastille: 0,
  };

  try {
    const { endpoint } = await req.json();
    if (typeof endpoint !== 'string' || !endpoint.startsWith('https://')) {
      return NextResponse.json(repli);
    }

    const supabase = base();

    const { data: abonnement } = await supabase
      .from('push_abonnements').select('client_id, recherche_id').eq('endpoint', endpoint).maybeSingle();
    if (!abonnement) return NextResponse.json(repli);

    /* ⚠️ On raisonne par CLIENT, plus par recherche. Une seule application
       porte tout son dossier (voir src/lib/espace.ts) : si on ne comptait que
       la recherche sous laquelle il s'est abonné, la pastille de l'icône
       mentirait dès qu'un bien arrive sur l'autre. */
    let clientId = (abonnement.client_id as string | null) || null;
    let jeton: string | null = null;

    if (clientId) {
      const { data: c } = await supabase
        .from('clients').select('token_espace').eq('id', clientId).maybeSingle();
      jeton = (c?.token_espace as string) || null;
    }

    /* Un abonnement d'avant la bascule, ou un client qui n'a pas encore son
       lien permanent : on remonte par la recherche. */
    if (!clientId || !jeton) {
      const { data: r } = await supabase
        .from('recherches').select('client_id, token_espace, clients(token_espace)')
        .eq('id', abonnement.recherche_id).maybeSingle();
      if (!r) return NextResponse.json(repli);
      clientId = clientId || (r.client_id as string);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      jeton = jeton || ((r as any).clients?.token_espace as string) || (r.token_espace as string) || null;
    }
    if (!clientId) return NextResponse.json(repli);

    const { data: toutes } = await supabase
      .from('recherches').select('id, espace_actif').eq('client_id', clientId);
    const visibles = (toutes || []).filter((r) => r.espace_actif !== false);
    if (visibles.length === 0) return NextResponse.json(repli);

    const lien = lienEspace(jeton, SITE) || SITE;

    /* Les biens présentés que le client n'a pas encore ouverts, toutes
       recherches confondues. C'est ce chiffre-là qui fait la notification ET
       la pastille sur l'icône : les deux disent forcément la même chose. */
    const { data: biens } = await supabase
      .from('biens')
      .select('id, titre, type_bien, surface, nb_pieces, ville, quartier, recherche_id')
      .in('recherche_id', visibles.map((r) => r.id))
      .eq('etape', 'presente')
      .is('vu_le', null)
      .order('envoye_le', { ascending: false, nullsFirst: false });

    const liste = (biens || []) as BienLite[];
    const n = liste.length;

    /* Le lien ouvre l'espace sur la bonne recherche. Quand le nouveau est
       réparti sur plusieurs, on n'en choisit aucune : le client arrive sur
       celle où il y a le plus récent, et le sélecteur lui montre le reste. */
    const memeRecherche = n > 0 && liste.every((b) => b.recherche_id === liste[0].recherche_id);
    const vers = memeRecherche ? `${lien}?r=${liste[0].recherche_id}` : lien;

    /* Il a déjà tout ouvert entre l'envoi et maintenant. Rare, mais ça arrive :
       on ne lui annonce pas un bien qu'il vient de lire. */
    if (n === 0) {
      return NextResponse.json({
        titre: 'Votre espace a été mis à jour',
        corps: 'Votre conseiller vient d’y travailler.',
        url: lien,
        pastille: 0,
      });
    }

    if (n === 1) {
      return NextResponse.json({
        titre: 'Un nouveau bien pour vous',
        corps: decrire(liste[0]),
        url: `${lien}?r=${liste[0].recherche_id}&bien=${liste[0].id}`,
        pastille: 1,
      });
    }

    return NextResponse.json({
      titre: `${n} nouveaux biens vous attendent`,
      corps: `Dont ${decrire(liste[0])}.`,
      url: vers,
      pastille: n,
    });
  } catch {
    return NextResponse.json(repli);
  }
}
