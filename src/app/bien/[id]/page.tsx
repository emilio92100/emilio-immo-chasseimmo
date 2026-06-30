import { createClient } from '@supabase/supabase-js';
import { notFound } from 'next/navigation';
import Image from 'next/image';
import PhotoCarousel from './PhotoCarousel';
import AboutPliable from './AboutPliable';

export const dynamic = 'force-dynamic';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

const BLEU = '#1a2332';
const BLEU_FONCE = '#131b27';
const DORE = '#c9a84c';
const CREME = '#f3eee3';
const TEXTE = '#2f3c52';
const DOUX = '#5a6a85';
const FIN = '#8492ab';
const LIGNE = 'rgba(26,35,50,0.08)';
const TINT = 'rgba(201,168,76,0.12)';

const CARD: React.CSSProperties = { background: '#ffffff', border: `1px solid ${LIGNE}`, borderRadius: 18, padding: '26px 28px', boxShadow: '0 6px 26px rgba(26,35,50,0.06)', marginBottom: 18 };

const CARD_SEC: React.CSSProperties = { ...CARD, position: 'relative', paddingTop: 40, marginTop: 36 };

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

function SectionHead({ icon, title }: { icon: string; title: string }) {
  return (
    <div style={{ position: 'absolute', top: -16, left: 24, display: 'inline-flex', alignItems: 'center', gap: 8, background: DORE, color: '#3a2e06', fontWeight: 600, fontSize: 15, padding: '8px 16px', borderRadius: 30, boxShadow: '0 4px 14px rgba(201,168,76,0.32)' }}>
      <i className={`ti ${icon}`} style={{ fontSize: 18 }} aria-hidden="true" />
      <span>{title}</span>
    </div>
  );
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
  const labelPrix = bien.prix_acquereur ? 'Prix FAI · honoraires inclus' : 'Prix';
  const prixM2 = prixAffiche && bien.surface ? Math.round(prixAffiche / bien.surface) : null;
  const photos: string[] = Array.isArray(bien.photos) ? bien.photos.filter(Boolean) : [];

  const stats: { icon: string; value: string; sub?: string; label: string }[] = [];
  if (bien.surface) stats.push({ icon: 'ti-ruler-2', value: `${bien.surface}`, sub: 'm²', label: 'Surface' });
  if (bien.nb_pieces) stats.push({ icon: 'ti-layout-grid', value: `${bien.nb_pieces}`, label: 'Pièces' });
  if (bien.nb_chambres) stats.push({ icon: 'ti-bed', value: `${bien.nb_chambres}`, label: bien.nb_chambres > 1 ? 'Chambres' : 'Chambre' });
  if (bien.etage !== null && bien.etage !== undefined) stats.push({ icon: 'ti-stairs-up', value: bien.etage === 0 ? 'RDC' : `${bien.etage}`, sub: bien.etage !== 0 && bien.etage_total ? `/${bien.etage_total}` : undefined, label: 'Étage' });
  if (bien.exposition) stats.push({ icon: 'ti-sun', value: `${bien.exposition}`, label: 'Exposition' });

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

  const infos: { icon: string; label: string; value: string }[] = [];
  if (bien.annee_construction) infos.push({ icon: 'ti-calendar', label: 'Année de construction', value: String(bien.annee_construction) });
  if (bien.etat_general) infos.push({ icon: 'ti-circle-check', label: 'État général', value: String(bien.etat_general) });
  if (bien.charges_trimestrielles) infos.push({ icon: 'ti-coins', label: 'Charges trimestrielles', value: `~ ${fmt(bien.charges_trimestrielles)} €` });
  if (bien.taxe_fonciere) infos.push({ icon: 'ti-receipt', label: 'Taxe foncière', value: `${fmt(bien.taxe_fonciere)} € / an` });

  return (
    <div style={{ minHeight: '100vh', background: CREME, fontFamily: '"Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif' }}>
      <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/@tabler/icons-webfont@latest/dist/tabler-icons.min.css" />

      {/* HEADER */}
      <header style={{ background: BLEU, padding: '16px 0', borderBottom: `2px solid ${DORE}` }}>
        <div style={{ maxWidth: 900, margin: '0 auto', padding: '0 24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <Image src="/logo_high_resolution_white.png" alt="Emilio Immobilier" width={280} height={64} style={{ height: 56, width: 'auto' }} priority />
          <div style={{ color: DORE, fontSize: 11, letterSpacing: 2.5, fontWeight: 500 }}>SÉLECTION PRIVÉE</div>
        </div>
      </header>

      <div className="bienwrap" style={{ maxWidth: 900, margin: '0 auto', padding: '32px 20px 56px' }}>

        {/* TITRE */}
        <div style={{ marginBottom: 18 }}>
          <h1 className="bienh1" style={{ fontSize: 30, fontWeight: 700, color: BLEU, margin: '0 0 8px', lineHeight: 1.2 }}>
            {bien.titre || `${bien.type_bien || 'Bien'}${bien.surface ? ` — ${bien.surface} m²` : ''}`}
          </h1>
          {(bien.quartier || bien.ville || bien.code_postal) && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 15, color: DOUX }}>
              <i className="ti ti-map-pin" style={{ fontSize: 18, color: DORE }} aria-hidden="true" />
              {[bien.quartier, bien.ville, bien.code_postal].filter(Boolean).join(', ')}
            </div>
          )}
        </div>

        {/* CARROUSEL */}
        <div style={{ borderRadius: 20, overflow: 'hidden', boxShadow: '0 14px 44px rgba(26,35,50,0.18)', marginBottom: 18 }}>
          <PhotoCarousel photos={photos} />
        </div>

        {/* BARRE PRIX */}
        {prixAffiche && (
          <div className="pricebar" style={{ ...CARD, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 20, flexWrap: 'wrap' }}>
            <div>
              <div style={{ fontSize: 30, fontWeight: 800, color: BLEU, lineHeight: 1 }}>{fmt(prixAffiche)} €</div>
              <div style={{ fontSize: 12, color: DORE, fontWeight: 600, marginTop: 6 }}>{labelPrix}{prixM2 ? <span style={{ color: DOUX, fontWeight: 400 }}>{`  ·  ${fmt(prixM2)} €/m²`}</span> : null}</div>
            </div>
            <div className="pricebtns" style={{ display: 'flex', gap: 10 }}>
              <a href="#contact" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', background: BLEU, color: 'white', textDecoration: 'none', padding: '13px 22px', borderRadius: 12, fontSize: 14, fontWeight: 600, whiteSpace: 'nowrap' }}>Demander une visite</a>
              <a href="tel:+33658957632" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, background: 'white', color: BLEU, textDecoration: 'none', padding: '13px 22px', borderRadius: 12, fontSize: 14, fontWeight: 600, border: `1.5px solid ${BLEU}`, whiteSpace: 'nowrap' }}>
                <i className="ti ti-phone" style={{ fontSize: 16 }} aria-hidden="true" /> 06 58 95 76 32
              </a>
            </div>
          </div>
        )}

        {/* STATS */}
        {stats.length > 0 && (
          <div style={CARD}>
            <div className="statsrow" style={{ display: 'flex' }}>
              {stats.map((s, i) => (
                <span key={i} style={{ display: 'contents' }}>
                  {i > 0 && <div className="statdiv" style={{ width: 1, background: LIGNE }} />}
                  <div className="statcell" style={{ flex: 1, textAlign: 'center', padding: '0 4px' }}>
                    <div style={{ color: DORE }}><i className={`ti ${s.icon}`} style={{ fontSize: 22 }} aria-hidden="true" /></div>
                    <div style={{ fontSize: 20, fontWeight: 700, color: BLEU, marginTop: 6, textTransform: 'capitalize' }}>{s.value}{s.sub && <span style={{ fontSize: 13, color: DOUX }}>{s.sub === 'm²' ? ' ' : ''}{s.sub}</span>}</div>
                    <div style={{ fontSize: 12, color: FIN, marginTop: 2 }}>{s.label}</div>
                  </div>
                </span>
              ))}
            </div>
          </div>
        )}

        {/* À PROPOS (pliable) */}
        {bien.description && (
          <div style={CARD_SEC}>
            <SectionHead icon="ti-home" title="À propos de ce bien" />
            <AboutPliable text={bien.description} />
          </div>
        )}

        {/* ÉQUIPEMENTS */}
        {features.length > 0 && (
          <div style={CARD_SEC}>
            <SectionHead icon="ti-sparkles" title="Équipements et caractéristiques" />
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '18px 16px' }}>
              {features.map((f, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <span style={{ width: 42, height: 42, borderRadius: 11, background: TINT, display: 'flex', alignItems: 'center', justifyContent: 'center', color: DORE, flex: 'none' }}>
                    <i className={`ti ${f.icon}`} style={{ fontSize: 20 }} aria-hidden="true" />
                  </span>
                  <span style={{ fontSize: 14, color: TEXTE, fontWeight: 500 }}>{f.label}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* PERFORMANCE ÉNERGÉTIQUE */}
        {(dpeInfo || gesInfo) && (
          <div style={CARD_SEC}>
            <SectionHead icon="ti-bolt" title="Performance énergétique" />
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(230px, 1fr))', gap: 14 }}>
              {dpeInfo && (
                <div style={{ background: CREME, borderRadius: 14, padding: 18, display: 'flex', alignItems: 'center', gap: 16 }}>
                  <div style={{ background: dpeInfo.bg, color: 'white', fontWeight: 700, fontSize: 26, width: 54, height: 54, display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: 12, flexShrink: 0 }}>{String(bien.dpe).toUpperCase()}</div>
                  <div>
                    <div style={{ fontSize: 11, color: FIN, letterSpacing: 1.2, textTransform: 'uppercase', marginBottom: 4 }}>Consommation</div>
                    <div style={{ fontSize: 15, fontWeight: 600, color: BLEU }}>DPE {dpeInfo.label}</div>
                    {bien.dpe_conso && <div style={{ fontSize: 13, color: DOUX, marginTop: 2 }}>{bien.dpe_conso} kWh/m².an</div>}
                  </div>
                </div>
              )}
              {gesInfo && (
                <div style={{ background: CREME, borderRadius: 14, padding: 18, display: 'flex', alignItems: 'center', gap: 16 }}>
                  <div style={{ background: gesInfo.bg, color: 'white', fontWeight: 700, fontSize: 26, width: 54, height: 54, display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: 12, flexShrink: 0 }}>{String(bien.ges).toUpperCase()}</div>
                  <div>
                    <div style={{ fontSize: 11, color: FIN, letterSpacing: 1.2, textTransform: 'uppercase', marginBottom: 4 }}>Émissions GES</div>
                    <div style={{ fontSize: 15, fontWeight: 600, color: BLEU }}>GES {gesInfo.label}</div>
                    {bien.ges_emissions && <div style={{ fontSize: 13, color: DOUX, marginTop: 2 }}>{bien.ges_emissions} kg CO₂/m².an</div>}
                  </div>
                </div>
              )}
            </div>
            {(bien.chauffage || bien.source_energie) && (
              <div style={{ display: 'flex', gap: 28, marginTop: 16, fontSize: 13, flexWrap: 'wrap' }}>
                {bien.chauffage && <div><span style={{ color: FIN }}>Chauffage :</span> <span style={{ color: TEXTE, fontWeight: 500 }}>{bien.chauffage}</span></div>}
                {bien.source_energie && <div><span style={{ color: FIN }}>Énergie :</span> <span style={{ color: TEXTE, fontWeight: 500 }}>{bien.source_energie}</span></div>}
              </div>
            )}
          </div>
        )}

        {/* INFOS COMPLÉMENTAIRES */}
        {infos.length > 0 && (
          <div style={{ ...CARD_SEC, marginBottom: 0 }}>
            <SectionHead icon="ti-info-circle" title="Informations complémentaires" />
            <div>
              {infos.map((row, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '14px 0', borderBottom: i < infos.length - 1 ? `1px solid ${LIGNE}` : 'none' }}>
                  <span style={{ color: DORE, flex: 'none' }}><i className={`ti ${row.icon}`} style={{ fontSize: 20 }} aria-hidden="true" /></span>
                  <span style={{ flex: 1, fontSize: 14, color: DOUX }}>{row.label}</span>
                  <span style={{ fontSize: 14, fontWeight: 700, color: BLEU, textAlign: 'right' }}>{row.value}</span>
                </div>
              ))}
            </div>
          </div>
        )}

      </div>

      {/* CONTACT */}
      <div style={{ maxWidth: 900, margin: '0 auto', padding: '0 20px' }}>
        <section id="contact" className="biencontact" style={{ background: BLEU, borderRadius: 24, padding: '40px 32px', color: 'white', textAlign: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12, marginBottom: 20 }}>
            <div style={{ width: 50, height: 50, borderRadius: '50%', background: 'rgba(201,168,76,0.15)', color: DORE, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: 16, border: `1px solid rgba(201,168,76,0.4)` }}>AR</div>
            <div style={{ textAlign: 'left' }}>
              <div style={{ fontSize: 15, fontWeight: 700 }}>Alexandre Rogelet</div>
              <div style={{ fontSize: 12, color: DORE }}>Votre chasseur dédié</div>
            </div>
          </div>
          <h2 style={{ fontSize: 23, fontWeight: 600, margin: '0 0 8px' }}>Ce bien vous intéresse ?</h2>
          <div style={{ fontSize: 14, opacity: 0.7, marginBottom: 24 }}>Contactez-moi pour organiser une visite, je reste à votre disposition.</div>
          <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap' }}>
            <a href="tel:+33658957632" style={{ display: 'inline-flex', alignItems: 'center', gap: 8, background: DORE, color: BLEU, padding: '14px 28px', borderRadius: 14, fontWeight: 700, fontSize: 14, textDecoration: 'none' }}>
              <i className="ti ti-phone" style={{ fontSize: 16 }} aria-hidden="true" /> 06 58 95 76 32
            </a>
            <a href="mailto:arogelet@emilio-immo.com" style={{ display: 'inline-flex', alignItems: 'center', gap: 8, background: 'rgba(255,255,255,0.08)', color: 'white', padding: '14px 28px', borderRadius: 14, fontWeight: 600, fontSize: 14, textDecoration: 'none', border: '1px solid rgba(255,255,255,0.25)' }}>
              <i className="ti ti-mail" style={{ fontSize: 16 }} aria-hidden="true" /> Me contacter
            </a>
          </div>
        </section>
      </div>

      {/* FOOTER */}
      <footer style={{ background: BLEU_FONCE, padding: '24px 20px', borderTop: '1px solid rgba(201,168,76,0.2)', marginTop: 40 }}>
        <div style={{ maxWidth: 900, margin: '0 auto', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
          <Image src="/logo_high_resolution_white.png" alt="Emilio Immobilier" width={220} height={50} style={{ height: 44, width: 'auto' }} />
          <div style={{ color: 'rgba(255,255,255,0.4)', fontSize: 11 }}>
            Chasse immobilière sur mesure · Paris &amp; Hauts-de-Seine · Document confidentiel
          </div>
        </div>
      </footer>

      <style>{`
        @media (max-width: 600px) {
          .bienh1 { font-size: 23px !important; }
          .bienwrap { padding: 22px 14px 44px !important; }
          .biencontact { padding: 32px 18px !important; }
          .pricebar { flex-direction: column !important; align-items: stretch !important; }
          .pricebtns { flex-direction: column !important; }
          .pricebtns a { width: 100% !important; }
          .statsrow { flex-wrap: wrap !important; }
          .statdiv { display: none !important; }
          .statcell { flex: 0 0 33.33% !important; padding: 10px 4px !important; }
        }
      `}</style>
    </div>
  );
}
