import { NextRequest, NextResponse, after } from 'next/server';
import { lienPropre, siteDe } from '@/lib/annonces-client';
import { lireAnnonce } from '@/lib/extraction-annonce';
import { pagePublique } from '@/lib/page-publique';
import { analyserPourRecherche } from '@/lib/analyse-bien-serveur';
import { ecritServeur } from '@/lib/ecritures';
import { tableAgencesAbsente, type PdfAgence } from '@/lib/agences-lien';
import { cheminPdfValide, lirePdfProposition, pdfDepose } from '@/lib/pdf-agence-serveur';
import { apercuDe, base, decoderPhoto, envoiDuCode, ficheNette, limite, nettoie, rechercheDuJeton, journalServeur, signatureValide, variantesLien } from '@/lib/agences-serveur';

/**
 * Le lien pour les agences (V3.197) : l'agence envoie un bien.
 *
 *   POST /api/agences/proposer  {
 *     token, url?, fiche?, signature?,            ← la lecture faite par api/agences/lire
 *     photos?: data:image/…[], adresse?, prix?, surface?, mot?,
 *     agence, interlocuteur?, tel?, email?,
 *     pdf?: { chemin, nom, pages }, pdf_apercu?, pdf_texte?, pdf_infos?,   ← V3.202
 *     de?                                                                  ← V3.202
 *   } → { ok, apercu } | { ok, deja: true }
 *
 * Un lien, au moins une photo, ou un PDF.
 *
 * V3.202 — Le PDF : déposé d'abord par la page dans le dossier privé (lien
 * signé d'api/agences/pdf) ; ici, on vérifie qu'il est arrivé, on garde sa
 * première page (image), puis il est lu et analysé juste après la réponse
 * (src/lib/pdf-agence-serveur.ts). `de` : le code au bout du lien ; l'envoi
 * du CRM qu'il désigne est gardé avec la proposition (« après ton mail du
 * 14 oct. »), si l'agence est bien celle à qui il a été envoyé. Le bien arrive dans l'onglet Veille de la
 * fiche du client (« Proposés par des agences »), puis l'analyse part juste
 * après la réponse (`after`) : Alexandre le trouve déjà noté. Une ligne au
 * Suivi, une relance « Proposé par une agence » (une seule en attente à la
 * fois par recherche).
 *
 * Publique dans src/proxy.ts : le jeton d'une recherche ouverte fait la serrure.
 */

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const BUCKET = 'photos-biens';
const PHOTOS_MAX = 6;
/* Trente biens par jour et par lien : bien au-delà d'un usage normal. */
const PAR_JOUR = 30;
const PREFIXE_RELANCE = 'Bien proposé par';

const nombre = (v: unknown): number | null => {
  const n = typeof v === 'number' ? v : Number(String(v ?? '').replace(/[\s\u00a0\u202f€m²]/g, '').replace(',', '.'));
  return Number.isFinite(n) && n > 0 && n < 1e9 ? n : null;
};

export async function POST(req: NextRequest) {
  const debut = Date.now();
  try {
    const body = await req.json().catch(() => null) as Record<string, unknown> | null;
    if (!body) return NextResponse.json({ ok: false, error: 'requete' }, { status: 400 });
    const token = String(body.token || '');
    const sb = base();
    const r = await rechercheDuJeton(sb, token);
    if (!r) return NextResponse.json({ ok: false, error: 'lien' }, { status: 401 });
    if (r.ferme) return NextResponse.json({ ok: false, error: 'ferme' }, { status: 410 });
    if (!limite(`proposer:${token}`, 15, 15 * 60_000)) return NextResponse.json({ ok: false, error: 'trop' }, { status: 429 });
    const rid = r.recherche.id as string;
    const cid = r.recherche.client_id as string;

    /* Ce qu'elle envoie. */
    const brut = typeof body.url === 'string' ? body.url.trim() : '';
    const url = brut ? lienPropre(brut) : null;
    if (brut && !url) return NextResponse.json({ ok: false, error: 'adresse' }, { status: 400 });
    const brutes: unknown[] = Array.isArray(body.photos) ? body.photos.slice(0, PHOTOS_MAX) : [];
    const photos = brutes.map(decoderPhoto).filter((x): x is NonNullable<ReturnType<typeof decoderPhoto>> => !!x);
    if (brutes.length && photos.length < brutes.length) return NextResponse.json({ ok: false, error: 'photo' }, { status: 400 });
    /* V3.202 — Le PDF, déjà déposé par la page : il doit être là, sous cette recherche. */
    let pdf: PdfAgence | null = null;
    const pdfRecu = body.pdf && typeof body.pdf === 'object' ? body.pdf as Record<string, unknown> : null;
    if (pdfRecu) {
      const taille = cheminPdfValide(rid, pdfRecu.chemin) ? await pdfDepose(sb, rid, pdfRecu.chemin) : null;
      if (!taille) return NextResponse.json({ ok: false, error: 'pdf' }, { status: 400 });
      const pages = Number(pdfRecu.pages);
      pdf = {
        chemin: String(pdfRecu.chemin), nom: nettoie(pdfRecu.nom, 160) || 'Le PDF de l’agence.pdf',
        pages: Number.isInteger(pages) && pages > 0 && pages < 2000 ? pages : null, taille, apercu: null,
      };
    }
    const pdfTexte = typeof body.pdf_texte === 'string' ? body.pdf_texte.slice(0, 40_000) : '';
    const pdfInfos = body.pdf_infos && typeof body.pdf_infos === 'object' ? body.pdf_infos as Record<string, unknown> : {};
    if (!url && !photos.length && !pdf) return NextResponse.json({ ok: false, error: 'vide' }, { status: 400 });
    const agence = nettoie(body.agence, 120);
    const interlocuteur = nettoie(body.interlocuteur, 120) || null;
    const tel = nettoie(body.tel, 40) || null;
    const email = nettoie(body.email, 160) || null;
    if (!agence) return NextResponse.json({ ok: false, error: 'agence' }, { status: 400 });
    if (!tel && !email) return NextResponse.json({ ok: false, error: 'contact' }, { status: 400 });
    const adresse = nettoie(body.adresse, 300) || null;
    const prix = nombre(body.prix);
    const surface = nombre(body.surface);
    const mot = nettoie(body.mot, 1200) || null;

    /* Pas plus de PAR_JOUR par jour. La table absente (SQL pas passé) : on le dit. */
    const depuis24h = new Date(Date.now() - 86_400_000).toISOString();
    const compte = await sb.from('propositions_agences').select('id', { count: 'exact', head: true })
      .eq('recherche_id', rid).gte('created_at', depuis24h);
    if (compte.error) {
      if (tableAgencesAbsente(compte.error)) return NextResponse.json({ ok: false, error: 'indisponible' }, { status: 503 });
      console.error('[agences/proposer] compte', compte.error.message);
      return NextResponse.json({ ok: false, error: 'erreur' }, { status: 500 });
    }
    if ((compte.count || 0) >= PAR_JOUR) return NextResponse.json({ ok: false, error: 'trop' }, { status: 429 });

    /* Le même lien (V3.198 : écrit avec ou sans « www. », avec ou sans « / »
       final), déjà chez Alexandre pour ce client : déjà proposé par une
       agence, dans son dossier, dans la Veille (écartés compris : l'agence
       n'en sait rien) ou envoyé par le client. Rien de nouveau pour la
       fiche ; une ligne au Suivi dit qui l'a proposé aussi, avec son numéro. */
    if (url) {
      const v = variantesLien(url);
      const [deja, bien, veille, client] = await Promise.all([
        sb.from('propositions_agences').select('agence').eq('recherche_id', rid).in('url', v).limit(1).maybeSingle(),
        sb.from('biens').select('titre, etape').eq('recherche_id', rid).in('url', v).limit(1).maybeSingle(),
        sb.from('veille_propositions').select('titre, statut').eq('recherche_id', rid).in('url', v).limit(1).maybeSingle(),
        sb.from('annonces_client').select('statut').eq('recherche_id', rid).in('url', v).limit(1).maybeSingle(),
      ]);
      for (const [quoi, r] of [['veille', veille], ['annonce du client', client]] as const) {
        if (r.error) console.error(`[agences/proposer] doublon (${quoi})`, r.error.message);
      }
      const ou = bien.data ? (bien.data.etape === 'presente' ? 'dans ses Présentés' : 'dans sa Sélection')
        : veille.data ? (veille.data.statut === 'ecarte' ? 'écarté dans la Veille' : 'dans la Veille')
        : client.data ? 'envoyé par le client'
        : deja.data ? `déjà proposé par ${deja.data.agence || 'une agence'}` : null;
      if (ou) {
        /* La même agence qui renvoie son lien (autre appareil, double envoi) : rien à noter. */
        const memeAgence = !!deja.data && String(deja.data.agence || '').trim().toLowerCase() === agence.toLowerCase();
        if (!memeAgence) {
          const qui = [agence, interlocuteur].filter(Boolean).join(' · ');
          await journalServeur(sb, '[agences/proposer] doublon', {
            client_id: cid, recherche_id: rid, type: 'proposition_agence',
            titre: `🏢 Bien déjà connu, proposé aussi par ${agence} — ${ou}`.slice(0, 300),
            description: [url, qui + (tel ? ` · ${tel}` : '') + (email ? ` · ${email}` : ''), mot ? `« ${mot} »` : ''].filter(Boolean).join('\n'),
            metadata: { url, deja: ou },
          });
        }
        return NextResponse.json({ ok: true, deja: true });
      }
    }

    /* La fiche : celle lue par api/agences/lire (signée), sinon on lit l'annonce maintenant. */
    let fiche: Record<string, unknown> = {};
    let lecture: 'ok' | 'partielle' | 'echec' | 'sans_lien' | 'pdf' = 'sans_lien';
    if (url) {
      const recue = body.fiche && typeof body.fiche === 'object' ? body.fiche : null;
      if (recue && signatureValide(token, url, recue, body.signature)) {
        fiche = ficheNette(recue);
      } else {
        const lu = await lireAnnonce(url, pagePublique);
        fiche = ficheNette(lu.bien);
        if (lu.partial !== false) fiche.titre = undefined;
      }
      const utile = !!(fiche.prix_vendeur || fiche.surface || fiche.nb_pieces);
      lecture = utile ? (fiche.titre ? 'ok' : 'partielle') : 'echec';
      if (!utile) fiche = {};
    }

    /* Les photos d'abord, rangées sous agences/<id>/ ; la ligne ensuite. */
    const id = crypto.randomUUID();
    const deposees: string[] = [];
    const urls: string[] = [];
    /* V3.202 — La première page du PDF (une image faite par la page) : l'aperçu de la carte. */
    const page1 = pdf ? decoderPhoto(body.pdf_apercu) : null;
    if (pdf && page1) {
      const chemin = `agences/${id}/pdf-page1-${Date.now()}.${page1.ext}`;
      const { error } = await sb.storage.from(BUCKET).upload(chemin, page1.octets, { contentType: page1.type, upsert: false });
      if (error) console.error('[agences/proposer] page 1 du PDF', error.message);
      else { deposees.push(chemin); pdf.apercu = sb.storage.from(BUCKET).getPublicUrl(chemin).data.publicUrl; }
    }
    for (let i = 0; i < photos.length; i++) {
      const p = photos[i];
      const chemin = `agences/${id}/${i + 1}-${Date.now()}.${p.ext}`;
      const { error } = await sb.storage.from(BUCKET).upload(chemin, p.octets, { contentType: p.type, upsert: false });
      if (error) {
        console.error('[agences/proposer] photo', error.message);
        if (deposees.length) await sb.storage.from(BUCKET).remove(deposees);
        return NextResponse.json({ ok: false, error: 'photo' }, { status: 500 });
      }
      deposees.push(chemin);
      urls.push(sb.storage.from(BUCKET).getPublicUrl(chemin).data.publicUrl);
    }

    /* Ce que l'agence a écrit complète la lecture, sans l'écraser. */
    const portail = url ? siteDe(url)?.nom || null : null;
    if (adresse && !fiche.adresse) fiche.adresse = adresse;
    if (prix && !fiche.prix_vendeur) fiche.prix_vendeur = prix;
    if (surface && !fiche.surface) fiche.surface = surface;
    /* Ce que la page a trouvé dans le texte du PDF, en attendant sa lecture complète. */
    if (pdf) {
      for (const [k, c] of [['prix_vendeur', 'prix'], ['surface', 'surface'], ['nb_pieces', 'pieces'], ['nb_chambres', 'chambres']] as const) {
        const n = nombre(pdfInfos[c]);
        if (n && !fiche[k]) fiche[k] = n;
      }
    }
    const photosFiche = Array.isArray(fiche.photos) ? (fiche.photos as string[]) : [];
    fiche.photos = [...photosFiche, ...urls].slice(0, 24);
    fiche.agence_nom = agence;
    if (tel) fiche.agence_tel = tel;
    if (url) fiche.url = url;
    fiche.source_portail = portail || agence;
    if (!fiche.titre) {
      const ville = fiche.ville || (adresse ? adresse.split(',').pop()?.trim() : '');
      const bouts = [fiche.type_bien, fiche.surface ? `${fiche.surface} m²` : '', ville].filter(Boolean);
      fiche.titre = bouts.length ? bouts.join(' · ') : `Bien proposé par ${agence}`;
    }
    if (pdf && !url) lecture = 'pdf';

    /* V3.202 — L'envoi d'où vient le lien (le code), si c'est bien cette agence-là. */
    const net = (t: unknown) => String(t || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '');
    const e = await envoiDuCode(sb, rid, body.de);
    const envoi = e && net(e.agence) === net(agence) ? { code: String(body.de), le: e.le, canal: e.canal } : null;

    const ligne: Record<string, unknown> = {
      id, client_id: cid, recherche_id: rid, url, portail, photos: urls,
      adresse, prix, surface, mot, agence, interlocuteur, tel, email, lecture, fiche, statut: 'nouveau',
      ...(pdf ? { pdf } : {}), ...(envoi ? { envoi } : {}),
    };
    let { error: eIns } = await sb.from('propositions_agences').insert(ligne);
    /* Les colonnes de la V3.202 pas encore là (SQL pas passé) : sans l'envoi, ça passe ; sans le PDF, non. */
    if (eIns && /\b(pdf|envoi)\b/.test(eIns.message || '') && /column|schema cache/i.test(eIns.message || '')) {
      if (pdf) {
        console.error('[agences/proposer] PDF', eIns.message);
        if (deposees.length) await sb.storage.from(BUCKET).remove(deposees);
        return NextResponse.json({ ok: false, error: 'pdf_indisponible' }, { status: 503 });
      }
      delete ligne.envoi;
      ({ error: eIns } = await sb.from('propositions_agences').insert(ligne));
    }
    if (eIns) {
      console.error('[agences/proposer] enregistrement', eIns.message);
      if (deposees.length) await sb.storage.from(BUCKET).remove(deposees);
      return NextResponse.json({ ok: false, error: tableAgencesAbsente(eIns) ? 'indisponible' : 'enregistrement' }, { status: 500 });
    }

    /* Pour Alexandre : une ligne au Suivi, une relance (une seule en attente à la fois). */
    const qui = [agence, interlocuteur].filter(Boolean).join(' · ');
    const quoi = [String(fiche.titre || ''), fiche.prix_vendeur ? `${Number(fiche.prix_vendeur).toLocaleString('fr-FR')} €` : ''].filter(Boolean).join(' · ');
    await journalServeur(sb, '[agences/proposer] journal', {
      client_id: cid, recherche_id: rid, type: 'proposition_agence',
      titre: `🏢 Bien proposé par ${agence} — ${quoi}`.slice(0, 300),
      description: [url || (pdf ? `Un PDF : ${pdf.nom}${urls.length ? ` et ${urls.length} photo${urls.length > 1 ? 's' : ''}` : ''}` : `${urls.length} photo${urls.length > 1 ? 's' : ''}, sans lien`), qui + (tel ? ` · ${tel}` : '') + (email ? ` · ${email}` : ''), mot ? `« ${mot} »` : ''].filter(Boolean).join('\n'),
      metadata: { proposition_agence_id: id },
    });
    const { count: dejaRelance } = await sb.from('relances').select('id', { count: 'exact', head: true })
      .eq('recherche_id', rid).eq('statut', 'en_attente').like('note', `${PREFIXE_RELANCE}%`);
    if (!dejaRelance) {
      await ecritServeur('[agences/proposer] relance', sb.from('relances').insert({
        client_id: cid, recherche_id: rid, type: 'manuelle', statut: 'en_attente', date_echeance: new Date().toISOString(),
        note: `${PREFIXE_RELANCE} ${agence} : ${quoi || 'un bien'} — à voir dans l’onglet Veille`.slice(0, 500),
      }));
    }

    /* L'analyse, juste après la réponse : l'agence n'attend pas. Avec un PDF :
       la lecture du PDF d'abord, puis l'analyse (src/lib/pdf-agence-serveur.ts). */
    if (pdf) {
      after(async () => {
        const r = await lirePdfProposition(sb, id, { texte: pdfTexte, analyser: true, debut });
        if (!r.ok) console.error('[agences/proposer] PDF', r.erreur);
      });
    } else if (lecture === 'ok' || lecture === 'partielle' || fiche.prix_vendeur || fiche.surface) {
      after(async () => {
        const dit: Record<string, unknown> = { agence: qui };
        if (mot) dit.son_mot = mot;
        if (adresse) dit.adresse_donnee = adresse;
        const a = await analyserPourRecherche(sb, rid, fiche, { source: 'agence', dit });
        if (!a.ok) { console.error('[agences/proposer] analyse', a.erreur); return; }
        await ecritServeur('[agences/proposer] analyse', sb.from('propositions_agences').update({ fiche: { ...fiche, ...a.analyse } }).eq('id', id));
      });
    }

    return NextResponse.json({ ok: true, apercu: apercuDe(fiche) });
  } catch (e) {
    console.error('[agences/proposer]', e instanceof Error ? e.message : String(e));
    return NextResponse.json({ ok: false, error: 'erreur' }, { status: 500 });
  }
}
