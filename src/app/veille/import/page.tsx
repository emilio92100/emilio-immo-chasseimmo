'use client';

import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { apprisDe } from '@/lib/visites';

/**
 * Page d'import de la veille — /veille/import
 *
 * C'est le point de rendez-vous entre Cowork et le CRM.
 * Cowork ouvre cette page (protégée par le code d'accès comme le reste du CRM)
 * et appelle deux fonctions exposées sur window :
 *
 *   await window.veilleLire()            → les recherches actives + ce qui est déjà connu
 *   await window.veilleDeposer(payload)  → dépose les propositions trouvées
 *   await window.veilleMaj(url, champs, recherche_id)
 *                                        → enrichit une proposition déjà déposée.
 *                                          La recherche est à préciser : la même
 *                                          annonce peut être proposée à plusieurs
 *                                          clients, avec la même URL.
 *   await window.majPlansBien(bienId, plans)
 *                                        → pose ou remplace les plans d'un bien déjà retenu.
 *
 * Aucune clé ne circule : c'est la page, déjà authentifiée, qui écrit.
 */

const NAVY = '#1a2332';
const OR = '#c9a84c';

type Ligne = { t: string; msg: string; ok: boolean };

export default function PageImportVeille() {
  const [journal, setJournal] = useState<Ligne[]>([]);
  const [pret, setPret] = useState(false);
  const [recherchesActives, setRecherchesActives] = useState<number | null>(null);

  const log = useCallback((msg: string, ok = true) => {
    setJournal((j) => [
      { t: new Date().toLocaleTimeString('fr-FR'), msg, ok },
      ...j.slice(0, 49),
    ]);
  }, []);

  useEffect(() => {
    /**
     * ─── Lecture : les recherches actives et ce qu'elles connaissent déjà ───
     *
     * Cette fonction est la mémoire de la veille. Ce qu'elle ne renvoie pas
     * n'existe pas pour le passage qui commence.
     *
     * Elle renvoyait la liste des URL déjà vues, et rien d'autre. Trois trous
     * en découlaient, tous comblés ici :
     *
     *  1. L'URL est la seule clé qui CHANGE. Une annonce retirée puis remise,
     *     ou confiée à une deuxième agence, revient sous un lien neuf et se
     *     fait reproposer. L'identifiant Yanport, lui, désigne le BIEN : c'est
     *     ce qui permet au CRM d'afficher « 3 agences » sur une seule carte.
     *     Il est déjà en base sur chaque proposition — il partait juste à la
     *     poubelle ici. Idem pour le titre, le prix et la surface, qui étaient
     *     lus puis jetés : ils servent de repli quand l'identifiant manque.
     *  2. La veille ne savait pas QUAND elle était passée. Elle ne pouvait
     *     donc pas décider seule entre « tout le stock » et « ce qui a bougé ».
     *  3. Elle ne savait pas CE QUI avait changé dans les critères. Le CRM
     *     l'écrit pourtant déjà, ligne par ligne : « Budget max : 700 000 € →
     *     800 000 € ». C'est cette phrase qui dit quelle tranche de marché
     *     vient de s'ouvrir, et donc où rouvrir le stock.
     */
    async function veilleLire() {
      const { data: recherches, error } = await supabase
        .from('recherches')
        .select('*, clients(id, prenom, nom, reference, statut)')
        .eq('active', true);

      if (error) return { ok: false, error: error.message };

      /* `yanport_id` est récent : si la colonne manque encore sur une table, on
         se rabat sur l'ancien jeu de colonnes plutôt que de casser la lecture
         — sans elle, aucune veille ne peut démarrer. */
      const lire = async (table: string, colonnes: string, repli: string, rechercheId: string) => {
        const r1 = await supabase.from(table).select(colonnes).eq('recherche_id', rechercheId);
        if (!r1.error) return (r1.data || []) as any[];
        const r2 = await supabase.from(table).select(repli).eq('recherche_id', rechercheId);
        return (r2.data || []) as any[];
      };

      const resultat = [];
      for (const r of recherches || []) {
        const [biens, props, passages, journal, visitesR] = await Promise.all([
          lire('biens',
            'url, yanport_id, titre, prix_vendeur, surface, ville, etape',
            'url, titre, prix_vendeur, surface', r.id),
          lire('veille_propositions',
            'url, yanport_id, statut, motif_ecart, titre, prix, surface, ville, created_at',
            'url, statut, motif_ecart, titre, prix, surface', r.id),
          supabase.from('veille_passages')
            .select('demarre_le, termine_le, nb_lues, nb_proposees, nb_ecartees, message')
            .eq('recherche_id', r.id)
            .order('termine_le', { ascending: false, nullsFirst: false })
            .limit(1),
          /* Les modifications de critères sont journalisées des deux côtés :
             par Alexandre depuis la fiche, par le client depuis son espace.
             Celles écrites depuis la fiche ne portent pas encore la recherche :
             on filtre donc sur le client, puis on garde ce qui concerne cette
             recherche-ci ou ce qui n'en désigne aucune. */
          supabase.from('journal')
            .select('created_at, titre, description, recherche_id')
            .eq('client_id', r.client_id)
            .eq('type', 'criteres_modifies')
            .order('created_at', { ascending: false })
            .limit(20),
          /* Ce que ses visites ont appris : les issues et leurs raisons. Avant
             le SQL des issues (outils/sql/visites-issue.sql), on se rabat sur
             l'avis du compte rendu, qui ne porte pas de raisons. */
          lire('visites', 'statut, issue, avis_client, motifs, aime, retenir', 'statut, avis_client', r.id),
        ]);

        const dernier = passages.data?.[0] || null;
        const depuis = dernier?.termine_le || null;

        const changements = (journal.data || [])
          .filter((j: any) => !j.recherche_id || j.recherche_id === r.id)
          .map((j: any) => ({
            quand: j.created_at,
            par: /client/i.test(j.titre || '') ? 'client' : 'alexandre',
            quoi: j.description || j.titre,
            depuis_le_dernier_passage: !depuis || j.created_at > depuis,
          }));

        /* Une ligne par bien déjà connu, avec ses trois façons d'être reconnu :
           le lien, l'identifiant Yanport, et son identité visible. */
        const connus = [
          ...(props as any[]).map((p) => ({
            ou: 'veille',
            url: p.url || null, yanport_id: p.yanport_id || null,
            titre: p.titre || null, prix: p.prix ?? null, surface: p.surface ?? null,
            ville: p.ville || null,
            statut: p.statut || null, motif: p.motif_ecart || null,
          })),
          ...(biens as any[]).map((b) => ({
            ou: b.etape === 'presente' ? 'presente' : 'selection',
            url: b.url || null, yanport_id: b.yanport_id || null,
            titre: b.titre || null, prix: b.prix_vendeur ?? null, surface: b.surface ?? null,
            ville: b.ville || null,
            statut: 'retenu', motif: null,
          })),
        ];

        resultat.push({
          recherche: r,

          /* ── l'ancien format, inchangé ── */
          deja_dans_biens: (biens as any[]).filter((b) => b.url).map((b) => b.url),
          deja_proposes: (props as any[]).map((p) => p.url).filter(Boolean),
          refus: (props as any[])
            .filter((p) => p.statut === 'ecarte' && p.motif_ecart)
            .map((p) => ({ titre: p.titre, motif: p.motif_ecart })),

          /* ── ce qu'il faut pour ne plus reproposer un bien déguisé ── */
          deja_vus: connus,
          yanport_deja_vus: Array.from(new Set(connus.map((c) => c.yanport_id).filter(Boolean))),

          /* ── ce qu'il faut pour choisir la profondeur du passage ── */
          dernier_passage: dernier,
          criteres_modifies_le: r.updated_at || null,
          criteres_bouges_depuis: !!depuis && !!r.updated_at && r.updated_at > depuis,
          changements_criteres: changements,

          /* ── ce que ses visites ont appris ──
             « eviter » : les raisons des visites non abouties, avec le nombre
             de visites où elles reviennent ; « aime » : ce qui lui a plu. Les
             lignes retirées par Alexandre n'y sont plus. C'est la synthèse du
             bloc « Ce que ses visites ont appris » de l'onglet Visites. */
          appris_visites: apprisDe(visitesR as any[], (r as any).appris_masques || []),
        });
      }
      return { ok: true, recherches: resultat };
    }

    // ─── Écriture : dépôt des propositions ───
    async function veilleDeposer(payload: any) {
      try {
        const { recherche_id, client_id, propositions = [], passage } = payload || {};
        if (!recherche_id || !client_id) {
          return { ok: false, error: 'recherche_id et client_id sont obligatoires' };
        }

        log(`Réception de ${propositions.length} proposition(s)…`);

        // Journal du passage
        const { data: passageRow } = await supabase
          .from('veille_passages')
          .insert({
            recherche_id,
            demarre_le: passage?.demarre_le || new Date().toISOString(),
            termine_le: new Date().toISOString(),
            nb_lues: passage?.nb_lues ?? propositions.length,
            nb_proposees: propositions.length,
            nb_ecartees: passage?.nb_ecartees ?? 0,
            statut: 'termine',
            message: passage?.message || null,
          })
          .select()
          .single();

        let inserees = 0;
        let ignorees = 0;
        const erreurs: string[] = [];

        for (const p of propositions) {
          try {
            // Photos : on les range dans le Storage avant d'insérer
            let photos: string[] = p.photos || [];
            if (photos.length > 0) {
              try {
                const res = await fetch('/api/upload-photos', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({
                    photos: photos.slice(0, 30),
                    bien_id: `veille/${recherche_id}/${Date.now()}`,
                  }),
                });
                if (res.ok) {
                  const d = await res.json();
                  if (d.urls?.length) photos = d.urls;
                }
              } catch {
                /* on garde les URLs d'origine */
              }
            }

            // Le plan : même traitement que les photos, mais rangé à part
            let plans: string[] = Array.isArray(p.plans) ? p.plans.filter(Boolean) : [];
            if (plans.length > 0) {
              try {
                const res = await fetch('/api/upload-photos', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({
                    photos: plans.slice(0, 6),
                    bien_id: `veille/${recherche_id}/plans-${Date.now()}`,
                  }),
                });
                if (res.ok) {
                  const d = await res.json();
                  if (d.urls?.length) plans = d.urls;
                }
              } catch {
                /* on garde les URLs d'origine */
              }
            }

            const { error } = await supabase.from('veille_propositions').insert({
              client_id,
              recherche_id,
              url: p.url,
              portail: p.portail || null,
              date_annonce: p.date_annonce || null,
              titre: p.titre || null,
              type_bien: p.type_bien || null,
              ville: p.ville || null,
              code_postal: p.code_postal || null,
              quartier: p.quartier || null,
              adresse: p.adresse || null,
              prix: p.prix ?? null,
              surface: p.surface ?? null,
              nb_pieces: p.nb_pieces ?? null,
              nb_chambres: p.nb_chambres ?? null,
              surface_sejour: p.surface_sejour ?? null,
              etage: p.etage ?? null,
              etage_total: p.etage_total ?? null,
              annee_construction: p.annee_construction ?? null,
              nb_lots: p.nb_lots ?? null,
              charges_trimestrielles: p.charges_trimestrielles ?? null,
              // ce que couvrent les charges, tel que l'annonce le dit
              // (« chauffage et eau chaude collectifs, gardien ») ; la colonne
              // n'est écrite que si l'annonce en dit quelque chose
              ...(p.charges_comprises ? { charges_comprises: String(p.charges_comprises) } : {}),
              taxe_fonciere: p.taxe_fonciere ?? null,
              dpe: p.dpe || null,
              ges: p.ges || null,
              terrasse: !!p.terrasse,
              balcon: !!p.balcon,
              jardin: !!p.jardin,
              parking: !!p.parking,
              nb_parking: p.nb_parking ?? null,
              ascenseur: !!p.ascenseur,
              cave: !!p.cave,
              gardien: !!p.gardien,
              surface_exterieur: p.surface_exterieur ?? null,
              exposition: p.exposition || null,
              description: p.description || null,
              photos,
              // la colonne n'est écrite que s'il y a un plan
              ...(plans.length ? { plans } : {}),
              points_forts: p.points_forts || [],
              points_attention: p.points_attention || [],
              score: p.score ?? null,
              statut: 'nouveau',

              // ─── Histoire du bien sur le marché (Yanport) ───
              // Ces champs suivent la proposition jusqu'à la fiche bien
              // quand tu cliques sur « Retenir » : c'est ce qui alimente
              // la frise des prix et le « en vente depuis ».
              yanport_id: p.yanport_id || null,
              est_particulier: !!p.est_particulier,
              agence: p.agence || null,
              adresse_probable: p.adresse_probable || null,
              situation: p.situation || null,
              date_publication: p.date_publication || p.date_annonce || null,
              prix_initial: p.prix_initial ?? null,
              nb_baisses: p.nb_baisses ?? null,
              nb_agences: p.nb_agences ?? null,
              historique_prix: p.historique_prix || [],
              date_derniere_baisse: p.date_derniere_baisse || null,
            });

            if (error) {
              // 23505 = doublon sur (recherche_id, url) : déjà proposé, on ignore
              if ((error as any).code === '23505') ignorees++;
              else erreurs.push(`${p.titre || p.url} : ${error.message}`);
            } else {
              inserees++;
            }
          } catch (e: any) {
            erreurs.push(`${p.titre || p.url} : ${e.message}`);
          }
        }

        log(
          `${inserees} ajoutée(s)` +
            (ignorees ? `, ${ignorees} déjà connue(s)` : '') +
            (erreurs.length ? `, ${erreurs.length} en erreur` : ''),
          erreurs.length === 0
        );
        erreurs.forEach((e) => log(e, false));

        return {
          ok: true,
          inserees,
          ignorees,
          erreurs,
          passage_id: passageRow?.id || null,
        };
      } catch (e: any) {
        log('Échec : ' + e.message, false);
        return { ok: false, error: e.message };
      }
    }

    /**
     * Mise à jour d'une proposition existante (enrichissement Yanport).
     *
     * Une même annonce peut être proposée à plusieurs clients : la table porte
     * alors une ligne par recherche, toutes avec la même URL. Filtrer sur la
     * seule URL écrivait donc chez tout le monde à la fois — un motif d'écart
     * noté pour un client faisait disparaître l'annonce chez l'autre.
     * On passe donc la recherche ; sans elle, on n'accepte la mise à jour que
     * si l'URL ne désigne qu'une seule ligne.
     */
    async function veilleMaj(url: string, champs: Record<string, unknown>, rechercheId?: string) {
      if (!url) return { ok: false, error: 'url manquante' };

      if (!rechercheId) {
        const { data: lignes, error: erreurLecture } = await supabase
          .from('veille_propositions')
          .select('id, recherche_id')
          .eq('url', url);
        if (erreurLecture) {
          log('Maj impossible : ' + erreurLecture.message, false);
          return { ok: false, error: erreurLecture.message };
        }
        if ((lignes?.length || 0) > 1) {
          const msg = `annonce proposée à ${lignes!.length} recherches — appelez veilleMaj(url, champs, recherche_id)`;
          log('Maj refusée : ' + msg, false);
          return { ok: false, error: msg, recherches: lignes!.map((l) => l.recherche_id) };
        }
      }

      const requete = supabase.from('veille_propositions').update(champs).eq('url', url);
      const { data, error } = await (rechercheId ? requete.eq('recherche_id', rechercheId) : requete)
        .select('id, titre');
      if (error) {
        log('Maj impossible : ' + error.message, false);
        return { ok: false, error: error.message };
      }
      log(`Mise à jour : ${data?.[0]?.titre || url}`);
      return { ok: true, majs: data?.length || 0 };
    }

    /** File d'attente des PDF demandés depuis le CRM. */
    async function pdfEnAttente() {
      const { data, error } = await supabase
        .from('biens')
        .select('id, titre, ville, url, prix_acquereur, surface, nb_pieces, nb_chambres, photos, description, client_id, recherche_id, clients(prenom, nom)')
        .eq('pdf_statut', 'demande')
        .order('pdf_demande_le', { ascending: true })
        .limit(10);
      if (error) return { ok: false, error: error.message };
      return { ok: true, biens: data || [] };
    }

    /** Réception du PDF par morceaux (le fichier est assemblé côté page). */
    const morceaux: Record<string, string[]> = {};

    function pdfMorceau(bienId: string, index: number, total: number, data: string) {
      if (!morceaux[bienId]) morceaux[bienId] = new Array(total).fill('');
      morceaux[bienId][index] = data;
      const recus = morceaux[bienId].filter((m) => m).length;
      if (index === 0) log(`PDF en réception (${total} morceaux)…`);
      return { ok: true, recus, total };
    }

    async function pdfTermine(bienId: string, nomFichier: string, message?: string) {
      try {
        const parts = morceaux[bienId];
        if (!parts || parts.some((p) => !p)) {
          return { ok: false, error: 'morceaux manquants' };
        }
        const b64 = parts.join('');
        const bin = atob(b64);
        const bytes = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
        const blob = new Blob([bytes], { type: 'application/pdf' });

        const chemin = `pdf/${bienId}/${Date.now()}-${nomFichier}`;
        const { error: upErr } = await supabase.storage
          .from('photos-biens')
          .upload(chemin, blob, { contentType: 'application/pdf', upsert: true });
        if (upErr) {
          await supabase.from('biens').update({ pdf_statut: 'echec', pdf_message: upErr.message }).eq('id', bienId);
          log('Dépôt du PDF impossible : ' + upErr.message, false);
          return { ok: false, error: upErr.message };
        }
        const { data: pub } = supabase.storage.from('photos-biens').getPublicUrl(chemin);
        await supabase.from('biens').update({
          pdf_statut: 'pret',
          pdf_pret_le: new Date().toISOString(),
          pdf_url: pub.publicUrl,
          pdf_message: message || null,
        }).eq('id', bienId);
        delete morceaux[bienId];
        log(`PDF prêt : ${nomFichier}`);
        return { ok: true, url: pub.publicUrl };
      } catch (e: any) {
        log('Échec du PDF : ' + e.message, false);
        return { ok: false, error: e.message };
      }
    }

    /** Remplace les photos d'un bien par des versions nettoyées. */
    async function majPhotosBien(bienId: string, photos: string[]) {
      const { error } = await supabase.from('biens').update({ photos }).eq('id', bienId);
      if (error) return { ok: false, error: error.message };
      log(`Photos mises à jour (${photos.length})`);
      return { ok: true };
    }

    /** Pose ou remplace les plans d'un bien déjà retenu. */
    async function majPlansBien(bienId: string, plans: string[]) {
      const { error } = await supabase.from('biens').update({ plans }).eq('id', bienId);
      if (error) return { ok: false, error: error.message };
      log(`Plans mis à jour (${plans.length})`);
      return { ok: true };
    }

    (window as any).veilleLire = veilleLire;
    (window as any).veilleDeposer = veilleDeposer;
    (window as any).veilleMaj = veilleMaj;
    (window as any).pdfEnAttente = pdfEnAttente;
    (window as any).pdfMorceau = pdfMorceau;
    (window as any).pdfTermine = pdfTermine;
    (window as any).majPhotosBien = majPhotosBien;
    (window as any).majPlansBien = majPlansBien;
    (window as any).__VEILLE_PRETE__ = true;
    setPret(true);

    // Petit état des lieux à l'ouverture
    supabase
      .from('recherches')
      .select('id', { count: 'exact', head: true })
      .eq('active', true)
      .then(({ count }) => setRecherchesActives(count ?? 0));

    return () => {
      delete (window as any).veilleLire;
      delete (window as any).veilleDeposer;
      delete (window as any).veilleMaj;
      delete (window as any).pdfEnAttente;
      delete (window as any).pdfMorceau;
      delete (window as any).pdfTermine;
      delete (window as any).majPhotosBien;
      delete (window as any).majPlansBien;
      delete (window as any).__VEILLE_PRETE__;
    };
  }, [log]);

  return (
    <div
      style={{
        minHeight: '100vh',
        background: '#f4f6fa',
        padding: '40px 24px',
        fontFamily: "'Plus Jakarta Sans', system-ui, sans-serif",
      }}
    >
      <div style={{ maxWidth: 760, margin: '0 auto' }}>
        <div style={{ marginBottom: 24 }}>
          <div style={{ fontSize: 24, fontWeight: 800, color: NAVY, letterSpacing: -0.4 }}>
            Veille — point de dépôt
          </div>
          <div style={{ fontSize: 14, color: '#64748b', marginTop: 5 }}>
            Cette page sert d&apos;interface entre la veille automatique et le CRM.
            Laisse-la ouverte pendant un passage.
          </div>
        </div>

        <div
          style={{
            background: 'white',
            border: '1px solid #e3e8f0',
            borderRadius: 16,
            padding: '18px 22px',
            display: 'flex',
            alignItems: 'center',
            gap: 14,
            marginBottom: 14,
          }}
        >
          <span
            style={{
              width: 10,
              height: 10,
              borderRadius: '50%',
              background: pret ? '#10b981' : '#cbd5e1',
              flexShrink: 0,
            }}
          />
          <div style={{ flexGrow: 1 }}>
            <div style={{ fontSize: 15, fontWeight: 700, color: NAVY }}>
              {pret ? 'Prête à recevoir' : 'Initialisation…'}
            </div>
            <div style={{ fontSize: 13, color: '#64748b', marginTop: 2 }}>
              {recherchesActives === null
                ? '…'
                : `${recherchesActives} recherche${recherchesActives > 1 ? 's' : ''} active${recherchesActives > 1 ? 's' : ''} dans le CRM`}
            </div>
          </div>
          <a
            href="/"
            style={{
              background: NAVY,
              color: 'white',
              borderRadius: 9,
              padding: '9px 16px',
              fontSize: 13,
              fontWeight: 700,
              textDecoration: 'none',
            }}
          >
            Retour au CRM
          </a>
        </div>

        <div
          style={{
            background: 'white',
            border: '1px solid #e3e8f0',
            borderRadius: 16,
            padding: '16px 22px',
          }}
        >
          <div
            style={{
              fontSize: 11,
              fontWeight: 800,
              color: '#94a3b8',
              textTransform: 'uppercase',
              letterSpacing: 0.9,
              marginBottom: 10,
            }}
          >
            Journal du passage
          </div>
          {journal.length === 0 ? (
            <div style={{ fontSize: 13, color: '#94a3b8', padding: '10px 0' }}>
              Aucune activité pour l&apos;instant.
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {journal.map((l, i) => (
                <div
                  key={i}
                  style={{
                    display: 'flex',
                    gap: 10,
                    fontSize: 13,
                    color: l.ok ? NAVY : '#b91c1c',
                    borderBottom: '1px solid #f1f5f9',
                    paddingBottom: 6,
                  }}
                >
                  <span style={{ color: '#94a3b8', flexShrink: 0, fontVariantNumeric: 'tabular-nums' }}>
                    {l.t}
                  </span>
                  <span style={{ fontWeight: l.ok ? 500 : 700 }}>{l.msg}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        <div
          style={{
            marginTop: 18,
            fontSize: 12,
            color: '#94a3b8',
            textAlign: 'center',
          }}
        >
          Accès réservé — <span style={{ color: OR, fontWeight: 700 }}>Emilio Immobilier</span>
        </div>
      </div>
    </div>
  );
}
