import { NextRequest, NextResponse } from 'next/server';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { ecritServeur } from '@/lib/ecritures';
import { pdfDocument, modele, aujourdhui, type Donnees } from '@/lib/actes';
import { OFFRE_ACHAT, VALIDITE_JOURS, honorairesOffre, mandatDe, noteOffre } from '@/lib/actes/offre-achat';
import { validerMandant, validerPersonne } from '@/lib/mandat';
import { lireIdentiteAgence } from '@/lib/agence';
import { visitePasseeParis } from '@/lib/visites';
import { lancerSignature, type DocSigne } from '@/lib/signature-documents';
import {
  lireFilVue, lireOffreVue, offresPourEspace, offrePartieEnSignature, alerteOffreARelire, fermerSansSuite, solderRelancesOffre,
} from '@/lib/offres-serveur';
import { champsOffreAgence, honoVendeurAuPrix, type VentePourOffre } from '@/lib/offre-agence';
import { etatDeOffre, offreCourante, lireSuivi, totalOffre, contreDepassee, brouillonCrmVivant, visiblePourClient, ENCOURS, FINIES, TETES_OFFRE, type DocOffre } from '@/lib/offres';

/**
 * « Faire une offre » depuis l'espace du client (V3.189).
 *
 *   POST /api/espace/offre { token, action: 'creer', bien_id, choix: 'relire' | 'signer',
 *                            depuis?, accepter?, saisie }
 *        Son offre, sur un bien qu'il a visité. `saisie` : les acquéreurs, son
 *        total frais d'agence compris, le financement, les conditions, la
 *        validité. Le prix pour le vendeur se calcule ici (arrondi au millier,
 *        src/lib/actes/offre-achat.ts) — jamais celui du navigateur.
 *          · 'relire' : un brouillon dans Documents ; Alexandre est prévenu
 *            (relance « Offre à relire », mail), il relit et l'envoie à signer ;
 *          · 'signer' : finalisée (PDF à l'identité de l'agence du jour),
 *            signature lancée comme depuis le CRM (lancerSignature) ; il signe
 *            tout de suite avec son lien, rendu ici (`lien`). Les autres
 *            acquéreurs reçoivent le leur par e-mail.
 *        `depuis` : l'offre du fil qu'elle suit (une contre-proposition, une
 *        offre refusée ou arrivée à échéance). `accepter` : il accepte la
 *        contre-proposition — le prix est celui du vendeur, il signe (pas de
 *        relecture : Alexandre l'a dit).
 *        V3.190 : aussi sur un bien de l'agence (un mandat de vente
 *        d'Alexandre) — le vendeur, le prix et l'adresse viennent de la fiche
 *        du bien en vente, sans honoraires de recherche (champsOffreAgence) ;
 *        signée, elle rejoint les offres de la fiche du bien
 *        (relierOffreAgence), où Alexandre note la réponse du vendeur.
 *   POST /api/espace/offre { token, action: 'sans_suite', id }
 *        il ne donne pas suite (une contre-proposition, une offre refusée ou
 *        arrivée à échéance), ou il retire celle qu'il avait confiée à son
 *        conseiller pour relecture (pas encore signée).
 *
 * Une seule offre en cours par bien. La route est publique (src/proxy.ts) :
 * le lien de l'espace fait la serrure, et tout se revérifie ici.
 */

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

function base(): SupabaseClient {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
}
const ko = (error: string, status = 400, plus: Record<string, unknown> = {}) => NextResponse.json({ ok: false, error, ...plus }, { status });
const court = (v: unknown, max: number) => (typeof v === 'string' ? v.replace(/\s+/g, ' ').trim().slice(0, max) : '');
const nombre = (v: unknown, min: number, max: number): number | null => {
  const x = typeof v === 'number' ? v : typeof v === 'string' ? Number(v.replace(/[\s  ]/g, '').replace(',', '.')) : NaN;
  return Number.isFinite(x) && x >= min && x <= max ? x : null;
};
const ymd = (d: Date) => new Intl.DateTimeFormat('fr-CA', { timeZone: 'Europe/Paris' }).format(d);

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const token = typeof body?.token === 'string' ? body.token : '';
    if (!token || token.length < 12 || token.length > 128) return ko('lien invalide', 401);
    const sb = base();
    const { data: recherche } = await sb.from('recherches').select('*').eq('token_espace', token).maybeSingle();
    if (!recherche || recherche.espace_actif === false) return ko('lien invalide', 401);
    const { data: client } = await sb.from('clients').select('*').eq('id', recherche.client_id).maybeSingle();
    if (!client) return ko('lien invalide', 401);
    const action = String(body.action || '');
    /* espace_evenements a une liste de types fermée : une offre est un avis sur le bien. */
    const evt = (detail: string | null, bien_id?: string | null) =>
      ecritServeur('[espace/offre] événement', sb.from('espace_evenements').insert({
        recherche_id: recherche.id, client_id: recherche.client_id, bien_id: bien_id || null, type: 'avis', detail: detail ? detail.slice(0, 300) : null,
      }));
    const il = client.civilite === 'Madame' ? 'Elle' : 'Il';
    /* Une offre de ce client, sur un bien de CETTE recherche (une offre du
       CRM peut ne pas porter la recherche). */
    const aLui = async (doc: DocOffre | null): Promise<boolean> => {
      if (!doc || doc.client_id !== client.id || !doc.bien_id) return false;
      if (doc.recherche_id === recherche.id) return true;
      if (doc.recherche_id) return false;
      const { data } = await sb.from('biens').select('id').eq('id', doc.bien_id).eq('recherche_id', recherche.id).maybeSingle();
      return !!data;
    };

    /* ── il ne donne pas suite ── */
    if (action === 'sans_suite') {
      const id = String(body.id || '');
      if (!/^[0-9a-f-]{36}$/i.test(id)) return ko('offre');
      const doc = await lireOffreVue(sb, id);
      if (!doc || !(await aLui(doc))) return ko('offre', 404);
      const etat = etatDeOffre(doc);
      if (etat !== 'contre' && etat !== 'a_relire' && !FINIES.includes(etat)) return ko('etat', 409, { etat });
      if (etat === 'sans_suite') return NextResponse.json({ ok: true, offres: await offresPourEspace(sb, client.id, [doc.bien_id || ''], client) });
      const pb = await fermerSansSuite(sb, doc, 'client');
      if (pb) return ko('enregistrement', 500);
      await evt(etat === 'a_relire' ? 'Retire l’offre qu’il avait confiée à son conseiller' : 'Ne donne pas suite à son offre', doc.bien_id);
      return NextResponse.json({ ok: true, offres: await offresPourEspace(sb, client.id, [doc.bien_id || ''], client) });
    }

    if (action !== 'creer') return ko('action');

    /* ── le bien : le sien, visité, encore disponible, trouvé ailleurs ── */
    const bienId = String(body.bien_id || '');
    const { data: bien } = await sb.from('biens').select('*').eq('id', bienId).eq('recherche_id', recherche.id).maybeSingle();
    if (!bien) return ko('bien inconnu', 404);
    /* V3.190 — Un bien de l'agence : son offre se fait ici aussi (Alexandre :
       « que moi, de mon côté, j'ai le même visuel »). Le bien doit être en
       vente (ou déjà sous offre) ; sa fiche donne le vendeur et le prix. */
    let vente: (VentePourOffre & { etape: string; archive: boolean | null }) | null = null;
    if (bien.bien_vente_id) {
      const { data: v } = await sb.from('biens_vente').select('id, etape, archive, ville, adresse, donnees').eq('id', bien.bien_vente_id).maybeSingle();
      if (!v || v.archive || !['mandat', 'offre'].includes(String(v.etape))) return ko('plus_dispo', 409);
      vente = v as VentePourOffre & { etape: string; archive: boolean | null };
    }
    if (bien.indispo) return ko('plus_dispo', 409);
    const { data: vis } = await sb.from('visites').select('id, statut, date_visite, heure, avis_client_le, issue').eq('recherche_id', recherche.id).eq('bien_id', bien.id);
    const faites = ((vis || []) as { id: string; statut: string; date_visite: string | null; heure: string | null; avis_client_le: string | null; issue: string | null }[])
      .filter(v => v.statut === 'effectuee' || (v.statut === 'a_venir' && visitePasseeParis(v)));
    if (!faites.length) return ko('pas_visite', 409);

    /* ── le fil : une seule offre en cours ── */
    let fil: DocOffre[];
    try { fil = await lireFilVue(sb, client.id, bien.id); } catch { return ko('lecture', 503); }
    /* Un bien de l'agence : une offre de lui notée à la main sur la fiche du
       bien (hors de ce fil), encore en cours ou acceptée, passe avant. */
    if (vente) {
      const duFil = new Set(fil.map(x => x.id));
      const { data: lignes, error: eL } = await sb.from('biens_vente_suivi').select('id, statut, donnees').eq('bien_id', vente.id).eq('type', 'offre').eq('client_id', client.id);
      if (eL) return ko('lecture', 503);
      const autre = ((lignes || []) as { statut: string | null; donnees: Record<string, unknown> | null }[])
        .find(l => (!l.statut || ['en_attente', 'contre', 'acceptee'].includes(l.statut)) && !duFil.has(String(l.donnees?.documentId || '')));
      if (autre) return ko(autre.statut === 'acceptee' ? 'acceptee' : 'en_cours', 409);
    }
    /* Un brouillon du CRM oublié (plus de trois semaines, ou passé sa date)
       ne bloque pas le client. */
    fil = fil.filter(x => visiblePourClient(x) || brouillonCrmVivant(x));
    const derniere = offreCourante(fil);
    const etatDerniere = derniere ? etatDeOffre(derniere) : null;
    const depuisId = typeof body.depuis === 'string' && body.depuis ? body.depuis : null;
    const accepter = body.accepter === true;
    let precedente: DocOffre | null = null;
    if (derniere && etatDerniere) {
      if (etatDerniere === 'acceptee') return ko('acceptee', 409);
      /* Son conseiller prépare déjà la suivante (« Elle accepte » du CRM). */
      if (lireSuivi(derniere.donnees).origine !== 'espace' && (etatDerniere === 'brouillon' || etatDerniere === 'a_finaliser')) return ko('en_preparation', 409);
      if (ENCOURS.includes(etatDerniere) && etatDerniere !== 'contre') return ko('en_cours', 409);
      /* Après une réponse (ou sans réponse à temps) : la suite part de celle-là. */
      if (depuisId && depuisId !== derniere.id) return ko('depasse', 409);
      precedente = derniere;
      if (etatDerniere === 'contre' && !depuisId) return ko('depasse', 409);
    } else if (depuisId) return ko('depasse', 409);
    const reponse = precedente ? lireSuivi(precedente.donnees).reponse : null;
    if (accepter) {
      if (!precedente || etatDerniere !== 'contre' || !reponse?.montant) return ko('depasse', 409);
      if (contreDepassee(reponse)) return ko('contre_depassee', 409);
    }
    /* Après une contre-proposition, pas de relecture (Alexandre). */
    let choix: 'relire' | 'signer' = body.choix === 'relire' && etatDerniere !== 'contre' ? 'relire' : 'signer';

    /* ── l'offre : le modèle d'abord (le bien, ses honoraires, le mandat), puis sa saisie ── */
    const identite = await lireIdentiteAgence(sb);
    const m = modele('offre_achat') || OFFRE_ACHAT;
    const ctx = {
      client: { id: client.id, prenom: client.prenom, nom: client.nom, adresse: client.adresse, emails: client.emails, telephones: client.telephones },
      bien, recherche, identite,
    };
    let d: Donnees = m.defaut(ctx as Parameters<typeof m.defaut>[0]);
    /* Après une offre (contre-proposition, refus, échéance) : la suivante
       part de celle-là — l'adresse, la description, le vendeur, ses
       honoraires tels qu'Alexandre les avait réglés. Le prix d'une
       contre-proposition acceptée se calcule ainsi comme dans l'espace. */
    if (precedente?.donnees) {
      const avant: Donnees = { ...(precedente.donnees as Donnees) };
      delete avant.suivi;
      /* Son lien à la fiche du bien est le sien ; `offreSuiviId` reste : la
         suivante reprend la même ligne (relierOffreAgence). */
      delete avant.lienAgence;
      d = { ...d, ...avant };
    }
    if (vente) d = { ...d, ...champsOffreAgence(vente, identite.nom || '') };
    const sx = (body.saisie && typeof body.saisie === 'object' ? body.saisie : {}) as Record<string, unknown>;

    /* Les acquéreurs (4 au plus). Le premier signe avec l'adresse de SA fiche :
       c'est elle qui le reconnaît dans son espace (documents-espace.ts). */
    const brut = Array.isArray(sx.acquereurs) ? (sx.acquereurs as unknown[]).slice(0, 4) : [];
    if (!brut.length) return ko('acquereurs', 400);
    const emailFiche = (Array.isArray(client.emails) ? client.emails : []).map((e: unknown) => String(e || '').trim().toLowerCase()).find((e: string) => e.includes('@')) || '';
    const champs: Record<string, Record<string, string>> = {};
    const acquereurs: Record<string, string>[] = [];
    const pris: string[] = [];
    brut.forEach((x, i) => {
      const o = { ...(x && typeof x === 'object' ? x as Record<string, unknown> : {}) };
      if (i === 0 && emailFiche) o.email = emailFiche;
      const v = i === 0 ? validerMandant(o) : validerPersonne(o, pris);
      if (!v.ok) { champs[`a${i}`] = v.champs; return; }
      pris.push(v.mandant.email);
      acquereurs.push({ ...v.mandant, nomNaissance: '' });
    });
    if (Object.keys(champs).length) return ko('identite', 400, { champs });

    d = { ...d, acquereurs };
    if (accepter && precedente && reponse?.montant) {
      /* Le prix du vendeur, tel quel : son total s'en calcule (ses honoraires entiers). */
      d = m.deduire ? m.deduire({ ...d, prix: reponse.montant }, 'prix') : { ...d, prix: reponse.montant };
    } else if (sx.auPrix === true && Number(d.prixAffiche) > 0) {
      /* « Proposer le prix affiché » : le prix de l'annonce, tel quel, pour le vendeur. */
      d = m.deduire ? m.deduire({ ...d, prix: Number(d.prixAffiche), auPrix: 'oui' }, 'prix') : { ...d, prix: Number(d.prixAffiche) };
    } else {
      const total = nombre(sx.total, 10_000, 100_000_000);
      if (!total) return ko('total', 400);
      d = m.deduire ? m.deduire({ ...d, total: Math.round(total) }, 'total') : { ...d, total: Math.round(total) };
    }
    if (vente) d = { ...d, honoVendeur: honoVendeurAuPrix(vente, Number(d.prix) || null) };
    const pret = sx.pret === 'non' ? 'non' : 'oui';
    const conditions = (Array.isArray(sx.conditions) ? sx.conditions : []).map(String).filter(c => c === 'vente' || c === 'autre');
    const auPlus = new Date(Date.now() + 30 * 86_400_000), demain = new Date(Date.now() + 86_400_000);
    const validite = typeof sx.validite === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(sx.validite) && sx.validite >= ymd(demain) && sx.validite <= ymd(auPlus)
      ? sx.validite : ymd(new Date(Date.now() + VALIDITE_JOURS * 86_400_000));
    const heure = typeof sx.validiteHeure === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(sx.validiteHeure) ? sx.validiteHeure : '18:00';
    d = {
      ...d,
      apport: nombre(sx.apport, 0, 100_000_000), pret,
      pretMontant: pret === 'oui' ? nombre(sx.pretMontant, 0, 100_000_000) : null,
      pretDuree: pret === 'oui' ? nombre(sx.pretDuree, 1, 35) : null,
      pretTaux: pret === 'oui' ? nombre(sx.pretTaux, 0, 20) : null,
      conditions,
      venteBien: conditions.includes('vente') ? court(sx.venteBien, 400) : '',
      conditionAutre: conditions.includes('autre') ? court(sx.conditionAutre, 600) : '',
      notaire: court(sx.notaire, 160),
      validite, validiteHeure: heure,
      signature: 'en_ligne', faitA: identite.ville || 'Paris', date: aujourdhui(),
    };
    /* Il ne peut pas signer seul quand quelque chose manque à l'offre, ou
       des honoraires sans mandat signé : son conseiller la relit (et règle
       ce qui manque). Jamais un mot du CRM ne remonte au client. Y compris
       après une contre-proposition : c'est le seul chemin qui reste. */
    let forceRelire = false;
    let raisonForce = '';
    if (choix === 'signer') {
      const manque = (m.manques ? m.manques(d) : []).filter(x => !/^Le lieu et la date/.test(x));
      if (honorairesOffre(d) > 0 && !mandatDe(d)) { forceRelire = true; raisonForce = 'son mandat de recherche n’est pas signé : relis-la, et règle le mandat'; }
      else if (manque.length) { forceRelire = true; raisonForce = `il manque : ${manque.join(', ').toLowerCase()} — complète-la`; }
      if (forceRelire) choix = 'relire';
    }
    d = { ...d, suivi: { origine: 'espace', choix, precedente: precedente?.id || null, ...(accepter ? { depuisContre: true } : {}) } };

    const titreBien = bien.titre || [bien.type_bien, bien.ville].filter(Boolean).join(' — ') || 'un bien';
    const { data: cree, error: eC } = await sb.from('documents').insert({
      modele: m.id, categorie: m.categorie, statut: 'brouillon', donnees: d,
      titre: m.titreDoc(d).slice(0, 200), sous_titre: m.sousTitre(d).slice(0, 200) || null, badge: m.badge ? m.badge(d) : null, numero: null,
      client_id: client.id, recherche_id: recherche.id, bien_id: bien.id,
    }).select('*').single();
    if (eC || !cree) { console.error('[espace/offre] création', eC?.message); return ko('enregistrement', 500); }
    const docId = (cree as { id: string }).id;
    /* Deux envois au même instant (deux onglets, un double appui) : une
       seule offre en cours par bien. Le plus récent se retire. */
    try {
      const apres = (await lireFilVue(sb, client.id, bien.id)).filter(x => x.id !== docId && (!derniere || x.id !== derniere.id)
        && x.created_at >= ((derniere?.created_at) || '') && (visiblePourClient(x) || brouillonCrmVivant(x)) && ENCOURS.includes(etatDeOffre(x)));
      if (apres.some(x => x.created_at <= (cree as { created_at: string }).created_at)) {
        await ecritServeur('[espace/offre] doublon retiré', sb.from('documents').delete().eq('id', docId).eq('statut', 'brouillon'));
        return ko('en_cours', 409);
      }
    } catch { /* relecture ratée : on garde l'offre */ }
    const total = totalOffre(d);
    const note = noteOffre(d);

    /* Sa visite porte l'issue « offre » (s'il ne l'avait pas dite), et les
       relances « Veut faire une offre » ont leur réponse. */
    const sansAvis = faites.filter(v => !v.avis_client_le && !v.issue).sort((a, b) => String(b.date_visite || '').localeCompare(String(a.date_visite || '')))[0];
    if (sansAvis) {
      const le = new Date().toISOString();
      await ecritServeur('[espace/offre] issue de la visite', sb.from('visites').update({
        issue: 'offre', issue_par: 'client', issue_le: le, avis_client_le: le, prix_envisage: total,
      }).eq('id', sansAvis.id).is('avis_client_le', null));
    }
    await ecritServeur('[espace/offre] relances « Veut faire une offre »', sb.from('relances').update({ statut: 'cloturee' })
      .eq('client_id', client.id).eq('type', 'rappel_client').eq('statut', 'en_attente').ilike('note', `Veut faire une offre — ${titreBien.replace(/[\\%_]/g, (c: string) => '\\' + c)}%`));

    /* ── à relire : Alexandre est prévenu ── */
    /* La précédente n'est remplacée qu'au départ en signature
       (offrePartieEnSignature) : un brouillon supprimé ne fait pas
       disparaître le fil. */
    const aRelire = async (raison: string) => {
      await solderRelancesOffre(sb, client.id, titreBien, [TETES_OFFRE.relire]);
      await ecritServeur('[espace/offre] relance', sb.from('relances').insert({
        client_id: client.id, recherche_id: recherche.id, type: 'rappel_client', statut: 'en_attente', date_echeance: new Date().toISOString(),
        note: `${TETES_OFFRE.relire} — ${titreBien}${total ? ` · ${total.toLocaleString('fr-FR')} € frais d’agence compris` : ''}`.slice(0, 600),
      }));
      await ecritServeur('[espace/offre] journal', sb.from('journal').insert({
        client_id: client.id, recherche_id: recherche.id, bien_id: bien.id, type: 'offre_faite',
        titre: `💶 Offre préparée dans son espace, à relire — ${titreBien}`,
        description: `${note ? `💶 ${note}\n` : ''}${raison}`, metadata: { document_id: docId, offre: true },
      }));
      await alerteOffreARelire(sb, { id: docId, client_id: client.id, bien_id: bien.id, donnees: d }, titreBien, il);
      await evt(`Offre préparée, à relire${total ? ` · ${total.toLocaleString('fr-FR')} €` : ''}`, bien.id);
    };
    if (choix === 'relire') {
      await aRelire(forceRelire ? `${il} voulait la signer seul${il === 'Elle' ? 'e' : ''}, mais ${raisonForce}. Puis envoie-la pour signature.` : `${il} te la confie pour relecture : relis-la dans Documents, puis envoie-la pour signature.`);
      return NextResponse.json({ ok: true, etat: 'a_relire', forceRelire, offres: await offresPourEspace(sb, client.id, [bien.id], client) });
    }

    /* ── il signe seul : finalisée, puis signature lancée ── */
    let lien: string | null = null;
    try {
      const octets = await pdfDocument(m, d, identite);
      const chemin = `documents/${docId}/pdf-${Date.now()}.pdf`;
      const up = await sb.storage.from('mandats').upload(chemin, octets, { contentType: 'application/pdf', upsert: false });
      if (up.error) throw new Error(up.error.message);
      const maintenant = new Date().toISOString();
      const { data: pret, error: eP } = await sb.from('documents').update({
        statut: 'pret', pdf_chemin: chemin, identite, finalise_le: maintenant, updated_at: maintenant,
      }).eq('id', docId).eq('statut', 'brouillon').select('*').single();
      if (eP || !pret) throw new Error(eP?.message || 'document');
      const saisis = acquereurs.map((p, i) => ({ cle: `a${i}`, email: p.email, prenom: p.prenom, nom: p.nom, telephone: p.telephone }));
      const r = await lancerSignature(sb, pret as DocSigne, saisis, { pasDeMail: ['a0'] });
      if ('erreur' in r) throw new Error(`${r.erreur}${r.plus?.message ? ` : ${r.plus.message}` : ''}`);
      const a0 = r.signataires.find(x => x.cle === 'a0');
      lien = a0?.jeton ? `/signer/${a0.jeton}` : null;
      const pbS = await offrePartieEnSignature(sb, { id: docId, donnees: d, client_id: client.id, bien_id: bien.id });
      if (pbS) console.error('[espace/offre] suite', pbS);
      await ecritServeur('[espace/offre] journal', sb.from('journal').insert({
        client_id: client.id, recherche_id: recherche.id, bien_id: bien.id, type: 'offre_faite',
        titre: `✍️ Offre préparée dans son espace, en signature — ${titreBien}`,
        description: `${note ? `💶 ${note}\n` : ''}Il la signe seul, avec son code.${acquereurs.length > 1 ? ` Les autres acquéreurs ont reçu leur lien : ${acquereurs.slice(1).map(p => p.email).join(', ')}.` : ''}${r.echecs.length ? `\n⚠️ Non envoyé : ${r.echecs.join(' ; ')}` : ''}`,
        metadata: { document_id: docId, offre: true },
      }));
      await evt(`Offre en signature${total ? ` · ${total.toLocaleString('fr-FR')} €` : ''}`, bien.id);
    } catch (e) {
      /* La signature n'a pas pu partir : l'offre reste à son conseiller, qui la reprend. */
      console.error('[espace/offre] signature', (e as Error).message);
      await aRelire(`${il} voulait la signer seul${il === 'Elle' ? 'e' : ''}, mais la signature n’a pas pu partir (${(e as Error).message}) : reprends-la dans Documents.`);
      return NextResponse.json({ ok: true, etat: 'a_relire', repli: true, offres: await offresPourEspace(sb, client.id, [bien.id], client) });
    }
    return NextResponse.json({ ok: true, etat: 'en_signature', lien, offres: await offresPourEspace(sb, client.id, [bien.id], client) });
  } catch (e) {
    console.error('[espace/offre]', e);
    return ko('erreur', 500);
  }
}
