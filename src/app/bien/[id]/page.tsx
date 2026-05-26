import { createClient } from '@supabase/supabase-js';
import { notFound } from 'next/navigation';
import Image from 'next/image';
import PhotoCarousel from './PhotoCarousel';

export const dynamic = 'force-dynamic';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

const BLEU = '#1a2332';
const BLEU_FONCE = '#131b27';
const DORE = '#c9a84c';
const CREME = '#faf6ee';

const DPE_COLORS: Record<string, { bg: string; label: string }> = {
  A: { bg: '#00a651', label: 'Excellent' },
  B: { bg: '#52b947', label: 'Très bon' },
  C: { bg: '#aed136', label: 'Bon' },
  D: { bg: '#ffeb3b', label: 'Moyen' },
  E: { bg: '#fbc02d', label: 'À améliorer' },
  F: { bg: '#f57c00', label: 'Énergivore' },
  G: { bg: '#d32f2f', label: 'Très énergivore' },
};

function fmt(n?: number | null) {
  if (!n) return null;
  return new Intl.NumberFormat('fr-FR').format(n);
}

export default async function PageBien({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const { data: bien } = await supabase
    .from('biens')
    .select('*')
    .eq('id', id)
    .maybeSingle();

  if (!bien) notFound();

  const prixAffiche = bien.prix_acquereur || bien.prix_vendeur;
  const labelPrix = bien.prix_acquereur ? 'Prix FAI' : 'Prix';
  const prixM2 = prixAffiche && bien.surface ? Math.round(prixAffiche / bien.surface) : null;
  const photos: string[] = Array.isArray(bien.photos) ? bien.photos.filter(Boolean) : [];

  // Caractéristiques détectées automatiquement depuis description + champs
  const desc = (bien.description || '').toLowerCase();
  const features: { icon: string; label: string }[] = [];
  if (bien.parking) features.push({ icon: 'ti-car', label: 'Parking' });
  if (desc.includes('ascenseur')) features.push({ icon: 'ti-elevator', label: 'Ascenseur' });
  if (desc.includes('cave')) features.push({ icon: 'ti-archive', label: 'Cave' });
  if (desc.includes('balcon')) features.push({ icon: 'ti-plant', label: 'Balcon' });
  if (desc.includes('terrasse')) features.push({ icon: 'ti-plant-2', label: 'Terrasse' });
  if (desc.includes('jardin')) features.push({ icon: 'ti-trees', label: 'Jardin' });
  if (desc.includes('gardien')) features.push({ icon: 'ti-shield-check', label: 'Gardien' });
  if (desc.includes('cuisine équipée') || desc.includes('cuisine equipee')) features.push({ icon: 'ti-tools-kitchen-2', label: 'Cuisine équipée' });
  if (desc.includes('climatisation') || desc.includes('clim')) features.push({ icon: 'ti-snowflake', label: 'Climatisation' });
  if (desc.includes('cheminée') || desc.includes('cheminee')) features.push({ icon: 'ti-flame', label: 'Cheminée' });
  if (desc.includes('parquet')) features.push({ icon: 'ti-grid-dots', label: 'Parquet' });
  if (desc.includes('moulures')) features.push({ icon: 'ti-frame', label: 'Moulures' });
  if (desc.includes('traversant')) features.push({ icon: 'ti-arrows-horizontal', label: 'Traversant' });
  if (desc.includes('rénové') || desc.includes('renove')) features.push({ icon: 'ti-paint', label: 'Rénové' });
  if (desc.includes('sécuris') || desc.includes('securis')) features.push({ icon: 'ti-lock', label: 'Sécurisé' });

  const dpeInfo = bien.dpe ? DPE_COLORS[bien.dpe.toUpperCase()] : null;

  return (
    <div style={{ minHeight: '100vh', background: '#ece6da', fontFamily: '"Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif' }}>
      <div style={{ maxWidth: 980, margin: '0 auto', padding: '24px 16px' }}>
        <div style={{ background: '#ffffff', borderRadius: 4, overflow: 'hidden', boxShadow: '0 8px 32px rgba(26,35,50,0.12)' }}>

          {/* TOP BAR — LOGO */}
          <div style={{ background: BLEU, padding: '14px 32px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: `2px solid ${DORE}` }}>
            <Image src="/logo_high_resolution_white.png" alt="Emilio Immobilier" width={180} height={44} style={{ height: 38, width: 'auto' }} priority />
            <div style={{ color: DORE, fontSize: 10, letterSpacing: 2.5, fontWeight: 500 }}>SÉLECTION PRIVÉE</div>
          </div>

          {/* CAROUSEL PHOTOS */}
          <PhotoCarousel photos={photos} />

          {/* TITRE + PRIX */}
          <div style={{ padding: '32px 32px 24px', borderBottom: '0.5px solid rgba(26,35,50,0.1)' }}>
            <div style={{ fontSize: 10, color: DORE, letterSpacing: 3, fontWeight: 500, marginBottom: 10 }}>
              {[bien.type_bien?.toUpperCase(), bien.nb_pieces && `${bien.nb_pieces} PIÈCES`].filter(Boolean).join(' · ')}
            </div>
            <h1 style={{ fontSize: 26, fontWeight: 500, color: BLEU, margin: '0 0 8px', lineHeight: 1.2 }}>
              {bien.titre || `${bien.type_bien || 'Bien'}${bien.surface ? ` de ${bien.surface} m²` : ''}`}
            </h1>
            {(bien.ville || bien.code_postal) && (
              <div style={{ fontSize: 13, color: '#64748b', marginBottom: 24 }}>
                <i className="ti ti-map-pin" style={{ fontSize: 14, verticalAlign: -2, marginRight: 4 }} aria-hidden="true" />
                {[bien.code_postal, bien.ville].filter(Boolean).join(' ')}
              </div>
            )}

            {prixAffiche && (
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', flexWrap: 'wrap', gap: 16, paddingTop: 16, borderTop: '0.5px solid rgba(26,35,50,0.08)' }}>
                <div>
                  <div style={{ fontSize: 10, color: '#64748b', letterSpacing: 2, marginBottom: 4 }}>{labelPrix.toUpperCase()}</div>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, flexWrap: 'wrap' }}>
                    <span style={{ fontSize: 32, fontWeight: 500, color: BLEU }}>{fmt(prixAffiche)} €</span>
                    {prixM2 && <span style={{ fontSize: 12, color: '#64748b' }}>{fmt(prixM2)} €/m²</span>}
                  </div>
                  {bien.prix_acquereur && <div style={{ fontSize: 10, color: '#94a3b8', marginTop: 4 }}>Honoraires d&apos;agence inclus</div>}
                </div>
                <a href="#contact" style={{ background: BLEU, color: 'white', padding: '12px 22px', borderRadius: 3, fontSize: 12, fontWeight: 500, letterSpacing: 1, textDecoration: 'none', display: 'inline-block' }}>
                  DEMANDER UNE VISITE
                </a>
              </div>
            )}
          </div>

          {/* BANDEAU CARACTÉRISTIQUES */}
          {(bien.surface || bien.nb_pieces || bien.nb_chambres || bien.etage !== null) && (
            <div style={{ background: CREME, padding: '22px 32px', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: 16, textAlign: 'center' }}>
              {bien.surface && (
                <div>
                  <div style={{ fontSize: 11, color: '#94a3b8', letterSpacing: 1.5, marginBottom: 4 }}>SURFACE</div>
                  <div style={{ fontSize: 18, fontWeight: 500, color: BLEU }}>{bien.surface} <span style={{ fontSize: 11, opacity: 0.6 }}>m²</span></div>
                </div>
              )}
              {bien.nb_pieces && (
                <div style={{ borderLeft: '0.5px solid rgba(26,35,50,0.15)' }}>
                  <div style={{ fontSize: 11, color: '#94a3b8', letterSpacing: 1.5, marginBottom: 4 }}>PIÈCES</div>
                  <div style={{ fontSize: 18, fontWeight: 500, color: BLEU }}>{bien.nb_pieces}</div>
                </div>
              )}
              {bien.nb_chambres && (
                <div style={{ borderLeft: '0.5px solid rgba(26,35,50,0.15)' }}>
                  <div style={{ fontSize: 11, color: '#94a3b8', letterSpacing: 1.5, marginBottom: 4 }}>CHAMBRES</div>
                  <div style={{ fontSize: 18, fontWeight: 500, color: BLEU }}>{bien.nb_chambres}</div>
                </div>
              )}
              {bien.etage !== null && bien.etage !== undefined && (
                <div style={{ borderLeft: '0.5px solid rgba(26,35,50,0.15)' }}>
                  <div style={{ fontSize: 11, color: '#94a3b8', letterSpacing: 1.5, marginBottom: 4 }}>ÉTAGE</div>
                  <div style={{ fontSize: 18, fontWeight: 500, color: BLEU }}>{bien.etage === 0 ? 'RDC' : bien.etage}</div>
                </div>
              )}
            </div>
          )}

          {/* CONTENU */}
          <div style={{ padding: 32 }}>

            {/* LE MOT D'ALEXANDRE */}
            <div style={{ background: CREME, borderLeft: `3px solid ${DORE}`, padding: '22px 26px', marginBottom: 32, position: 'relative' }}>
              <div style={{ position: 'absolute', top: -10, left: 22, background: 'white', padding: '0 12px', fontSize: 10, color: DORE, letterSpacing: 2.5, fontWeight: 500 }}>
                LE MOT D&apos;ALEXANDRE
              </div>
              <p style={{ margin: '0 0 14px', fontSize: 14, lineHeight: 1.8, color: '#334155', fontStyle: 'italic' }}>
                &quot;J&apos;ai sélectionné ce bien personnellement parmi des dizaines d&apos;annonces. Il correspond à vos critères et présente un excellent potentiel. N&apos;hésitez pas à me contacter pour organiser une visite ou échanger sur le quartier.&quot;
              </p>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, paddingTop: 12, borderTop: '0.5px solid rgba(201,168,76,0.3)' }}>
                <div style={{ width: 36, height: 36, borderRadius: '50%', background: BLEU, color: DORE, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 500 }}>AR</div>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 500, color: BLEU }}>Alexandre ROGELET</div>
                  <div style={{ fontSize: 11, color: '#64748b' }}>Votre chasseur dédié · Emilio Immobilier</div>
                </div>
              </div>
            </div>

            {/* DESCRIPTION */}
            {bien.description && (
              <div style={{ marginBottom: 36 }}>
                <div style={{ fontSize: 10, color: DORE, letterSpacing: 2.5, fontWeight: 500, marginBottom: 12 }}>DESCRIPTION</div>
                <p style={{ fontSize: 13, color: '#475569', lineHeight: 1.8, margin: 0, whiteSpace: 'pre-wrap' }}>
                  {bien.description}
                </p>
              </div>
            )}

            {/* CARACTÉRISTIQUES DÉTECTÉES */}
            {features.length > 0 && (
              <div style={{ marginBottom: 36 }}>
                <div style={{ fontSize: 10, color: DORE, letterSpacing: 2.5, fontWeight: 500, marginBottom: 16 }}>CARACTÉRISTIQUES DU BIEN</div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 10 }}>
                  {features.map((f, i) => (
                    <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', background: CREME, borderRadius: 3 }}>
                      <i className={`ti ${f.icon}`} style={{ fontSize: 18, color: DORE }} aria-hidden="true" />
                      <span style={{ fontSize: 13, color: '#334155' }}>{f.label}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* DPE */}
            {dpeInfo && (
              <div style={{ marginBottom: 36 }}>
                <div style={{ fontSize: 10, color: DORE, letterSpacing: 2.5, fontWeight: 500, marginBottom: 16 }}>PERFORMANCE ÉNERGÉTIQUE</div>
                <div style={{ background: CREME, padding: 18, borderRadius: 4, display: 'inline-flex', alignItems: 'center', gap: 12 }}>
                  <div style={{ background: dpeInfo.bg, color: 'white', fontWeight: 500, fontSize: 22, width: 46, height: 46, display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: 4 }}>
                    {bien.dpe.toUpperCase()}
                  </div>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 500, color: BLEU }}>DPE — Classe {bien.dpe.toUpperCase()}</div>
                    <div style={{ fontSize: 11, color: '#64748b' }}>{dpeInfo.label}</div>
                  </div>
                </div>
              </div>
            )}

            {/* DÉTAILS FINANCIERS */}
            {prixAffiche && (
              <div style={{ marginBottom: 36 }}>
                <div style={{ fontSize: 10, color: DORE, letterSpacing: 2.5, fontWeight: 500, marginBottom: 16 }}>DÉTAILS FINANCIERS</div>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                  <tbody>
                    <tr>
                      <td style={{ padding: '12px 0', color: '#64748b', borderBottom: '0.5px solid rgba(26,35,50,0.08)' }}>Prix du bien</td>
                      <td style={{ padding: '12px 0', textAlign: 'right', fontWeight: 500, color: BLEU, borderBottom: '0.5px solid rgba(26,35,50,0.08)' }}>{fmt(prixAffiche)} €</td>
                    </tr>
                    {prixM2 && (
                      <tr>
                        <td style={{ padding: '12px 0', color: '#64748b', borderBottom: '0.5px solid rgba(26,35,50,0.08)' }}>Prix au m²</td>
                        <td style={{ padding: '12px 0', textAlign: 'right', color: '#334155', borderBottom: '0.5px solid rgba(26,35,50,0.08)' }}>{fmt(prixM2)} €/m²</td>
                      </tr>
                    )}
                    {bien.prix_acquereur && (
                      <tr>
                        <td style={{ padding: '12px 0', color: '#64748b' }}>Honoraires d&apos;agence</td>
                        <td style={{ padding: '12px 0', textAlign: 'right', color: '#334155' }}>Inclus dans le prix</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            )}

            {/* CTA */}
            <div id="contact" style={{ background: BLEU, padding: 28, textAlign: 'center', color: 'white', borderRadius: 4 }}>
              <div style={{ fontSize: 10, color: DORE, letterSpacing: 2.5, fontWeight: 500, marginBottom: 8 }}>CE BIEN VOUS INTÉRESSE ?</div>
              <div style={{ fontSize: 17, fontWeight: 500, marginBottom: 4 }}>Alexandre ROGELET</div>
              <div style={{ fontSize: 12, opacity: 0.7, marginBottom: 18 }}>Votre chasseur Emilio Immobilier</div>
              <div style={{ display: 'flex', gap: 10, justifyContent: 'center', flexWrap: 'wrap' }}>
                <a href="tel:+33658957632" style={{ background: DORE, color: BLEU, padding: '12px 24px', borderRadius: 3, fontWeight: 500, fontSize: 12, letterSpacing: 1, textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                  <i className="ti ti-phone" style={{ fontSize: 14 }} aria-hidden="true" /> 06 58 95 76 32
                </a>
                <a href="mailto:arogelet@emilio-immo.com" style={{ background: 'rgba(255,255,255,0.05)', color: 'white', padding: '12px 24px', borderRadius: 3, fontWeight: 500, fontSize: 12, letterSpacing: 1, textDecoration: 'none', border: '0.5px solid rgba(255,255,255,0.3)', display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                  <i className="ti ti-mail" style={{ fontSize: 14 }} aria-hidden="true" /> M&apos;ENVOYER UN MAIL
                </a>
              </div>
            </div>

          </div>

          {/* FOOTER */}
          <div style={{ background: BLEU_FONCE, padding: '20px 32px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: '1px solid rgba(201,168,76,0.2)', flexWrap: 'wrap', gap: 12 }}>
            <Image src="/logo_high_resolution_white.png" alt="Emilio Immobilier" width={140} height={32} style={{ height: 26, width: 'auto' }} />
            <div style={{ color: 'rgba(255,255,255,0.4)', fontSize: 10 }}>
              Chasse immobilière sur mesure · Paris &amp; région
            </div>
          </div>

        </div>

        {/* Mention bas de page */}
        <div style={{ textAlign: 'center', padding: '24px 16px', color: '#64748b', fontSize: 11 }}>
          Ce document est strictement confidentiel et destiné au client mandant.
        </div>
      </div>

      {/* Tabler Icons */}
      <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/@tabler/icons-webfont@latest/dist/tabler-icons.min.css" />
    </div>
  );
}
