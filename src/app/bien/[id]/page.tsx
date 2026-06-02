import { createClient } from '@supabase/supabase-js';
import { notFound } from 'next/navigation';
import Image from 'next/image';
import PhotoCarousel from './PhotoCarousel';

export const dynamic = 'force-dynamic';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

// Palette — on s'appuie sur le bleu du logo, l'or n'est qu'une touche
const BLEU = '#1a2332';        // titres + valeurs
const BLEU_FONCE = '#131b27';  // footer
const DORE = '#c9a84c';        // accent minimal
const BG = '#f7f4ed';
const TEXTE = '#2f3c52';       // corps (bleu profond, pas noir)
const DOUX = '#5a6a85';        // texte secondaire (bleu-gris)
const FIN = '#8492ab';         // labels (bleu-gris clair)
const LIGNE = 'rgba(26,35,50,0.08)';
const TINT = 'rgba(26,35,50,0.05)'; // fond doux navy

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
  if (n === null || n === undefined) return null;
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

  // Caractéristiques
  const features: { icon: string; label: string }[] = [];
  if (bien.parking) features.push({ icon: 'ti-car', label: 'Parking' });
  if (bien.ascenseur) features.push({ icon: 'ti-elevator', label: 'Ascenseur' });
  if (bien.cave) features.push({ icon: 'ti-archive', label: 'Cave' });
  if (bien.balcon) features.push({ icon: 'ti-plant', label: bien.surface_balcon ? `Balcon ${bien.surface_balcon}m²` : 'Balcon' });
  if (bien.terrasse) features.push({ icon: 'ti-deer', label: bien.surface_terrasse ? `Terrasse ${bien.surface_terrasse}m²` : 'Terrasse' });
  if (bien.jardin) features.push({ icon: 'ti-trees', label: 'Jardin' });
  if (bien.gardien) features.push({ icon: 'ti-shield-check', label: 'Gardien' });
  if (bien.cuisine_equipee) features.push({ icon: 'ti-tools-kitchen-2', label: 'Cuisine équipée' });
  if (bien.climatisation) features.push({ icon: 'ti-snowflake', label: 'Climatisation' });
  if (bien.traversant) features.push({ icon: 'ti-arrows-horizontal', label: 'Traversant' });

  const dpeInfo = bien.dpe ? DPE_COLORS[String(bien.dpe).toUpperCase()] : null;
  const gesInfo = bien.ges ? DPE_COLORS[String(bien.ges).toUpperCase()] : null;

  // Lignes "infos complémentaires"
  const infos: { label: string; value: string }[] = [];
  if (bien.annee_construction) infos.push({ label: 'Année de construction', value: String(bien.annee_construction) });
  if (bien.etat_general) infos.push({ label: 'État général', value: String(bien.etat_general) });
  if (bien.charges_trimestrielles) infos.push({ label: 'Charges trimestrielles', value: `~ ${fmt(bien.charges_trimestrielles)} €` });
  if (bien.taxe_fonciere) infos.push({ label: 'Taxe foncière', value: `${fmt(bien.taxe_fonciere)} € / an` });

  return (
    <div style={{ minHeight: '100vh', background: BG, fontFamily: '"Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif' }}>
      <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/@tabler/icons-webfont@latest/dist/tabler-icons.min.css" />

      {/* TOP BAR — LOGO */}
      <header style={{ background: BLEU, padding: '16px 0', borderBottom: `2px solid ${DORE}` }}>
        <div style={{ maxWidth: 1100, margin: '0 auto', padding: '0 24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <Image src="/logo_high_resolution_white.png" alt="Emilio Immobilier" width={180} height={44} style={{ height: 40, width: 'auto' }} priority />
          <div style={{ color: DORE, fontSize: 11, letterSpacing: 2.5, fontWeight: 500 }}>SÉLECTION PRIVÉE</div>
        </div>
      </header>

      <div className="bienwrap" style={{ maxWidth: 1100, margin: '0 auto', padding: '32px 16px 64px' }}>

        {/* TITRE EN HAUT */}
        <div style={{ marginBottom: 24 }}>
          <h1 className="bienh1" style={{ fontSize: 28, fontWeight: 600, color: BLEU, margin: '0 0 8px', lineHeight: 1.2 }}>
            {bien.titre || `${bien.type_bien || 'Bien'}${bien.surface ? ` de ${bien.surface} m²` : ''}`}
          </h1>
          {(bien.quartier || bien.ville || bien.code_postal) && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 14, color: DOUX }}>
              <i className="ti ti-map-pin" style={{ fontSize: 16, color: BLEU }} aria-hidden="true" />
              {[bien.quartier, bien.ville, bien.code_postal].filter(Boolean).join(', ')}
            </div>
          )}
        </div>

        {/* CAROUSEL PHOTOS */}
        <div style={{ borderRadius: 20, overflow: 'hidden', boxShadow: '0 10px 40px rgba(26,35,50,0.12)' }}>
          <PhotoCarousel photos={photos} />
        </div>

        {/* GRID PRINCIPAL : contenu + sidebar prix */}
        <div className="biengrid" style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 340px', gap: 40, marginTop: 32 }}>

          {/* ===== COLONNE GAUCHE ===== */}
          <div className="biencol" style={{ minWidth: 0 }}>

            {/* INFOS RAPIDES */}
            <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap', alignItems: 'center', paddingBottom: 24, borderBottom: `1px solid ${LIGNE}` }}>
              {bien.surface && (
                <div>
                  <div style={{ fontSize: 22, fontWeight: 600, color: BLEU }}>{bien.surface}<span style={{ fontSize: 14, color: DOUX, marginLeft: 2 }}>m²</span></div>
                  <div style={{ fontSize: 12, color: FIN, marginTop: 2 }}>Surface</div>
                </div>
              )}
              {bien.nb_pieces && (
                <>
                  <div style={{ width: 1, alignSelf: 'stretch', background: LIGNE }} />
                  <div>
                    <div style={{ fontSize: 22, fontWeight: 600, color: BLEU }}>{bien.nb_pieces}</div>
                    <div style={{ fontSize: 12, color: FIN, marginTop: 2 }}>Pièces</div>
                  </div>
                </>
              )}
              {bien.nb_chambres && (
                <>
                  <div style={{ width: 1, alignSelf: 'stretch', background: LIGNE }} />
                  <div>
                    <div style={{ fontSize: 22, fontWeight: 600, color: BLEU }}>{bien.nb_chambres}</div>
                    <div style={{ fontSize: 12, color: FIN, marginTop: 2 }}>Chambre{bien.nb_chambres > 1 ? 's' : ''}</div>
                  </div>
                </>
              )}
              {bien.etage !== null && bien.etage !== undefined && (
                <>
                  <div style={{ width: 1, alignSelf: 'stretch', background: LIGNE }} />
                  <div>
                    <div style={{ fontSize: 22, fontWeight: 600, color: BLEU }}>
                      {bien.etage === 0 ? 'RDC' : bien.etage}
                      {bien.etage_total && <span style={{ fontSize: 14, color: DOUX, marginLeft: 2 }}>/{bien.etage_total}</span>}
                    </div>
                    <div style={{ fontSize: 12, color: FIN, marginTop: 2 }}>Étage</div>
                  </div>
                </>
              )}
              {bien.exposition && (
                <>
                  <div style={{ width: 1, alignSelf: 'stretch', background: LIGNE }} />
                  <div>
                    <div style={{ fontSize: 22, fontWeight: 600, color: BLEU, textTransform: 'capitalize' }}>{bien.exposition}</div>
                    <div style={{ fontSize: 12, color: FIN, marginTop: 2 }}>Exposition</div>
                  </div>
                </>
              )}
            </div>

            {/* DESCRIPTION */}
            {bien.description && (
              <section style={{ padding: '28px 0', borderBottom: `1px solid ${LIGNE}` }}>
                <h2 style={{ fontSize: 18, fontWeight: 600, color: BLEU, margin: '0 0 14px' }}>À propos de ce bien</h2>
                <div style={{ fontSize: 14, color: TEXTE, lineHeight: 1.8, whiteSpace: 'pre-wrap' }}>
                  {bien.description}
                </div>
              </section>
            )}

            {/* CARACTÉRISTIQUES — version épurée, sans boîtes encadrées */}
            {features.length > 0 && (
              <section style={{ padding: '28px 0', borderBottom: `1px solid ${LIGNE}` }}>
                <h2 style={{ fontSize: 18, fontWeight: 600, color: BLEU, margin: '0 0 20px' }}>Équipements et caractéristiques</h2>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(190px, 1fr))', gap: '20px 16px' }}>
                  {features.map((f, i) => (
                    <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                      <span style={{ width: 40, height: 40, borderRadius: 11, background: TINT, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                        <i className={`ti ${f.icon}`} style={{ fontSize: 19, color: BLEU }} aria-hidden="true" />
                      </span>
                      <span style={{ fontSize: 14, color: TEXTE, fontWeight: 500 }}>{f.label}</span>
                    </div>
                  ))}
                </div>
              </section>
            )}

            {/* PERFORMANCE ÉNERGÉTIQUE — fond doux, sans bordure */}
            {(dpeInfo || gesInfo) && (
              <section style={{ padding: '28px 0', borderBottom: `1px solid ${LIGNE}` }}>
                <h2 style={{ fontSize: 18, fontWeight: 600, color: BLEU, margin: '0 0 18px' }}>Performance énergétique</h2>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 14 }}>
                  {dpeInfo && (
                    <div style={{ background: TINT, padding: 20, borderRadius: 14, display: 'flex', alignItems: 'center', gap: 16 }}>
                      <div style={{ background: dpeInfo.bg, color: 'white', fontWeight: 700, fontSize: 26, width: 56, height: 56, display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: 12, flexShrink: 0 }}>
                        {String(bien.dpe).toUpperCase()}
                      </div>
                      <div>
                        <div style={{ fontSize: 11, color: FIN, letterSpacing: 1.2, textTransform: 'uppercase', marginBottom: 4 }}>Consommation</div>
                        <div style={{ fontSize: 15, fontWeight: 600, color: BLEU }}>DPE {dpeInfo.label}</div>
                        {bien.dpe_conso && <div style={{ fontSize: 13, color: DOUX, marginTop: 2 }}>{bien.dpe_conso} kWh/m².an</div>}
                      </div>
                    </div>
                  )}
                  {gesInfo && (
                    <div style={{ background: TINT, padding: 20, borderRadius: 14, display: 'flex', alignItems: 'center', gap: 16 }}>
                      <div style={{ background: gesInfo.bg, color: 'white', fontWeight: 700, fontSize: 26, width: 56, height: 56, display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: 12, flexShrink: 0 }}>
                        {String(bien.ges).toUpperCase()}
                      </div>
                      <div>
                        <div style={{ fontSize: 11, color: FIN, letterSpacing: 1.2, textTransform: 'uppercase', marginBottom: 4 }}>Émissions GES</div>
                        <div style={{ fontSize: 15, fontWeight: 600, color: BLEU }}>GES {gesInfo.label}</div>
                        {bien.ges_emissions && <div style={{ fontSize: 13, color: DOUX, marginTop: 2 }}>{bien.ges_emissions} kg CO₂/m².an</div>}
                      </div>
                    </div>
                  )}
                </div>
                {(bien.chauffage || bien.source_energie) && (
                  <div style={{ display: 'flex', gap: 28, marginTop: 18, fontSize: 13 }}>
                    {bien.chauffage && <div><span style={{ color: FIN }}>Chauffage :</span> <span style={{ color: TEXTE, fontWeight: 500 }}>{bien.chauffage}</span></div>}
                    {bien.source_energie && <div><span style={{ color: FIN }}>Énergie :</span> <span style={{ color: TEXTE, fontWeight: 500 }}>{bien.source_energie}</span></div>}
                  </div>
                )}
              </section>
            )}

            {/* INFORMATIONS COMPLÉMENTAIRES — liste épurée, sans encadré */}
            {infos.length > 0 && (
              <section style={{ padding: '28px 0' }}>
                <h2 style={{ fontSize: 18, fontWeight: 600, color: BLEU, margin: '0 0 8px' }}>Informations complémentaires</h2>
                <div>
                  {infos.map((row, i) => (
                    <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 16, padding: '15px 0', borderBottom: i < infos.length - 1 ? `1px solid ${LIGNE}` : 'none' }}>
                      <span style={{ fontSize: 14, color: DOUX }}>{row.label}</span>
                      <span style={{ fontSize: 14, fontWeight: 600, color: BLEU, textAlign: 'right' }}>{row.value}</span>
                    </div>
                  ))}
                </div>
              </section>
            )}

          </div>

          {/* ===== SIDEBAR DROITE — PRIX & CTA STICKY ===== */}
          <aside className="bienaside">
            <div className="bienstick" style={{ position: 'sticky', top: 24, background: 'white', borderRadius: 20, padding: 28, boxShadow: '0 10px 40px rgba(26,35,50,0.1)', border: `1px solid ${LIGNE}` }}>

              {prixAffiche && (
                <>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap', marginBottom: 4 }}>
                    <span style={{ fontSize: 28, fontWeight: 600, color: BLEU }}>{fmt(prixAffiche)} €</span>
                    <span style={{ fontSize: 11, color: DOUX, fontWeight: 600, letterSpacing: 1 }}>{labelPrix}</span>
                  </div>
                  {prixM2 && (
                    <div style={{ fontSize: 13, color: DOUX, marginBottom: 4 }}>
                      {fmt(prixM2)} €/m²
                    </div>
                  )}
                  {bien.prix_acquereur && (
                    <div style={{ fontSize: 11, color: FIN, marginBottom: 24 }}>Honoraires d&apos;agence inclus</div>
                  )}
                </>
              )}

              <a href="#contact" style={{ display: 'block', width: '100%', background: BLEU, color: 'white', padding: '14px 22px', borderRadius: 12, fontSize: 14, fontWeight: 600, textAlign: 'center', textDecoration: 'none', marginBottom: 10, boxSizing: 'border-box' }}>
                Demander une visite
              </a>
              <a href="tel:+33658957632" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, width: '100%', background: 'white', color: BLEU, padding: '14px 22px', borderRadius: 12, fontSize: 14, fontWeight: 600, textDecoration: 'none', border: `1.5px solid ${BLEU}`, boxSizing: 'border-box' }}>
                <i className="ti ti-phone" style={{ fontSize: 16 }} aria-hidden="true" /> 06 58 95 76 32
              </a>

              <div style={{ borderTop: `1px solid ${LIGNE}`, paddingTop: 20, marginTop: 24 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <div style={{ width: 44, height: 44, borderRadius: '50%', background: BLEU, color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, fontWeight: 600, flexShrink: 0 }}>AR</div>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 14, fontWeight: 600, color: BLEU }}>Alexandre ROGELET</div>
                    <div style={{ fontSize: 12, color: DOUX }}>Votre chasseur dédié</div>
                  </div>
                </div>
              </div>
            </div>
          </aside>

        </div>

        {/* SECTION CONTACT BAS DE PAGE */}
        <section id="contact" className="biencontact" style={{ background: BLEU, borderRadius: 24, padding: '40px 32px', color: 'white', textAlign: 'center', marginTop: 48 }}>
          <div style={{ fontSize: 11, color: DORE, letterSpacing: 2.5, fontWeight: 500, marginBottom: 12 }}>CE BIEN VOUS INTÉRESSE ?</div>
          <h2 style={{ fontSize: 24, fontWeight: 600, margin: '0 0 8px' }}>Contactez-moi pour organiser une visite</h2>
          <div style={{ fontSize: 14, opacity: 0.7, marginBottom: 24 }}>Je reste à votre entière disposition</div>
          <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap' }}>
            <a href="tel:+33658957632" style={{ display: 'inline-flex', alignItems: 'center', gap: 8, background: DORE, color: BLEU, padding: '14px 28px', borderRadius: 14, fontWeight: 600, fontSize: 14, textDecoration: 'none' }}>
              <i className="ti ti-phone" style={{ fontSize: 16 }} aria-hidden="true" /> 06 58 95 76 32
            </a>
            <a href="mailto:arogelet@emilio-immo.com" style={{ display: 'inline-flex', alignItems: 'center', gap: 8, background: 'rgba(255,255,255,0.08)', color: 'white', padding: '14px 28px', borderRadius: 14, fontWeight: 600, fontSize: 14, textDecoration: 'none', border: '1px solid rgba(255,255,255,0.25)' }}>
              <i className="ti ti-mail" style={{ fontSize: 16 }} aria-hidden="true" /> arogelet@emilio-immo.com
            </a>
          </div>
        </section>

      </div>

      {/* FOOTER */}
      <footer style={{ background: BLEU_FONCE, padding: '24px 16px', textAlign: 'center', borderTop: '1px solid rgba(201,168,76,0.2)' }}>
        <div style={{ maxWidth: 1100, margin: '0 auto', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
          <Image src="/logo_high_resolution_white.png" alt="Emilio Immobilier" width={140} height={32} style={{ height: 28, width: 'auto' }} />
          <div style={{ color: 'rgba(255,255,255,0.4)', fontSize: 11 }}>
            Chasse immobilière sur mesure · Paris &amp; région · Document confidentiel
          </div>
        </div>
      </footer>

      {/* Responsive sur mobile */}
      <style>{`
        @media (max-width: 880px) {
          .biengrid { grid-template-columns: 1fr !important; gap: 24px !important; }
          .bienstick { position: static !important; }
          .bienaside { order: -1; }
        }
        @media (max-width: 560px) {
          .bienh1 { font-size: 22px !important; }
          .bienwrap { padding: 20px 14px 48px !important; }
          .biencontact { padding: 32px 20px !important; }
        }
      `}</style>
    </div>
  );
}
