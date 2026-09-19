'use client';

import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';

/**
 * Page d'import de la veille — /veille/import
 *
 * C'est le point de rendez-vous entre Cowork et le CRM.
 * Cowork ouvre cette page (protégée par le code d'accès comme le reste du CRM)
 * et appelle deux fonctions exposées sur window :
 *
 *   await window.veilleLire()            → les recherches actives + ce qui est déjà connu
 *   await window.veilleDeposer(payload)  → dépose les propositions trouvées
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
    // ─── Lecture : les recherches actives et ce qu'elles connaissent déjà ───
    async function veilleLire() {
      const { data: recherches, error } = await supabase
        .from('recherches')
        .select('*, clients(id, prenom, nom, reference, statut)')
        .eq('active', true);

      if (error) return { ok: false, error: error.message };

      const resultat = [];
      for (const r of recherches || []) {
        const [biens, props] = await Promise.all([
          supabase.from('biens').select('url, titre, prix_vendeur, surface').eq('recherche_id', r.id),
          supabase
            .from('veille_propositions')
            .select('url, statut, motif_ecart, titre, prix, surface')
            .eq('recherche_id', r.id),
        ]);
        resultat.push({
          recherche: r,
          deja_dans_biens: (biens.data || []).filter((b) => b.url).map((b) => b.url),
          deja_proposes: (props.data || []).map((p) => p.url),
          refus: (props.data || [])
            .filter((p) => p.statut === 'ecarte' && p.motif_ecart)
            .map((p) => ({ titre: p.titre, motif: p.motif_ecart })),
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
              points_forts: p.points_forts || [],
              points_attention: p.points_attention || [],
              score: p.score ?? null,
              statut: 'nouveau',
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

    /** Mise à jour d'une proposition existante (enrichissement Yanport). */
    async function veilleMaj(url: string, champs: Record<string, unknown>) {
      if (!url) return { ok: false, error: 'url manquante' };
      const { data, error } = await supabase
        .from('veille_propositions')
        .update(champs)
        .eq('url', url)
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

    (window as any).veilleLire = veilleLire;
    (window as any).veilleDeposer = veilleDeposer;
    (window as any).veilleMaj = veilleMaj;
    (window as any).pdfEnAttente = pdfEnAttente;
    (window as any).pdfMorceau = pdfMorceau;
    (window as any).pdfTermine = pdfTermine;
    (window as any).majPhotosBien = majPhotosBien;
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
