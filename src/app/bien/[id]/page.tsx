import { createClient } from '@supabase/supabase-js';
import { notFound } from 'next/navigation';
import Image from 'next/image';

export const dynamic = 'force-dynamic';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

const BLEU = '#1a2332';
const DORE = '#c9a84c';
const FOND = '#f5f1ea';

const DPE_COLORS: Record<string, string> = {
  A: '#00a651', B: '#52b947', C: '#aed136', D: '#ffeb3b',
  E: '#fbc02d', F: '#f57c00', G: '#d32f2f',
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
  const photos: string[] = Array.isArray(bien.photos) ? bien.photos.filter(Boolean) : [];
  const photoPrincipale = photos[0];
  const autresPhotos = photos.slice(1);

  const caracteristiques = [
    bien.surface && { icon: '📐', label: 'Surface', val: `${bien.surface} m²` },
    bien.nb_pieces && { icon: '🚪', label: 'Pièces', val: `${bien.nb_pieces}` },
    bien.nb_chambres && { icon: '🛏️', label: 'Chambres', val: `${bien.nb_chambres}` },
    bien.etage !== null && bien.etage !== undefined && { icon: '🏢', label: 'Étage', val: bien.etage === 0 ? 'RDC' : `${bien.etage}` },
    bien.parking && { icon: '🅿️', label: 'Parking', val: 'Oui' },
    bien.type_bien && { icon: '🏠', label: 'Type', val: bien.type_bien },
  ].filter(Boolean) as { icon: string; label: string; val: string }[];

  return (
    <div style={{ minHeight: '100vh', background: FOND, fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif' }}>
      {/* HEADER */}
      <header style={{ background: BLEU, padding: '24px 0', borderBottom: `3px solid ${DORE}` }}>
        <div style={{ maxWidth: 1100, margin: '0 auto', padding: '0 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <Image src="/logo_high_resolution_white.png" alt="Emilio Immobilier" width={180} height={60} style={{ height: 50, width: 'auto' }} priority />
          <div style={{ textAlign: 'right', color: 'white' }}>
            <div style={{ fontSize: 11, color: DORE, letterSpacing: 2, textTransform: 'uppercase', fontWeight: 700 }}>Chasseur immobilier</div>
            <div style={{ fontSize: 14, opacity: 0.85, marginTop: 2 }}>Sélection privée</div>
          </div>
        </div>
      </header>

      <main style={{ maxWidth: 1100, margin: '0 auto', padding: '40px 24px' }}>

        {/* HERO PHOTO */}
        {photoPrincipale && (
          <div style={{ position: 'relative', width: '100%', height: 480, borderRadius: 16, overflow: 'hidden', boxShadow: '0 20px 60px rgba(26,35,50,0.25)', marginBottom: 32 }}>
            <img src={photoPrincipale} alt={bien.titre || 'Photo principale'} style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
            <div style={{ position: 'absolute', top: 20, left: 20, background: 'rgba(26,35,50,0.92)', color: 'white', padding: '8px 16px', borderRadius: 30, fontSize: 12, fontWeight: 600, letterSpacing: 1.5, textTransform: 'uppercase', backdropFilter: 'blur(8px)' }}>
              ✨ Bien sélectionné pour vous
            </div>
          </div>
        )}

        {/* TITRE + PRIX */}
        <div style={{ background: 'white', borderRadius: 16, padding: 36, boxShadow: '0 8px 32px rgba(26,35,50,0.08)', marginBottom: 24 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 24 }}>
            <div style={{ flex: 1, minWidth: 280 }}>
              <h1 style={{ fontSize: 32, fontWeight: 800, color: BLEU, margin: 0, lineHeight: 1.2 }}>
                {bien.titre || `${bien.type_bien || 'Bien'} ${bien.surface ? `de ${bien.surface}m²` : ''}`}
              </h1>
              {(bien.ville || bien.code_postal) && (
                <div style={{ fontSize: 16, color: '#64748b', marginTop: 10, display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span>📍</span>
                  <span>{[bien.code_postal, bien.ville].filter(Boolean).join(' ')}</span>
                </div>
              )}
            </div>
            {prixAffiche && (
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontSize: 11, color: DORE, letterSpacing: 2, textTransform: 'uppercase', fontWeight: 700, marginBottom: 4 }}>{labelPrix}</div>
                <div style={{ fontSize: 36, fontWeight: 800, color: BLEU, lineHeight: 1 }}>
                  {fmt(prixAffiche)} €
                </div>
                {bien.prix_acquereur && <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 4 }}>Honoraires inclus</div>}
              </div>
            )}
          </div>
        </div>

        {/* CARACTÉRISTIQUES */}
        {caracteristiques.length > 0 && (
          <div style={{ background: 'white', borderRadius: 16, padding: 28, boxShadow: '0 8px 32px rgba(26,35,50,0.08)', marginBottom: 24 }}>
            <div style={{ fontSize: 11, color: DORE, letterSpacing: 2, textTransform: 'uppercase', fontWeight: 700, marginBottom: 16 }}>Caractéristiques</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 16 }}>
              {caracteristiques.map((c, i) => (
                <div key={i} style={{ background: FOND, borderRadius: 12, padding: '16px 14px', textAlign: 'center' }}>
                  <div style={{ fontSize: 22, marginBottom: 4 }}>{c.icon}</div>
                  <div style={{ fontSize: 11, color: '#64748b', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 2 }}>{c.label}</div>
                  <div style={{ fontSize: 16, fontWeight: 700, color: BLEU }}>{c.val}</div>
                </div>
              ))}
              {bien.dpe && (
                <div style={{ background: FOND, borderRadius: 12, padding: '16px 14px', textAlign: 'center' }}>
                  <div style={{ fontSize: 11, color: '#64748b', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6 }}>DPE</div>
                  <div style={{ display: 'inline-block', background: DPE_COLORS[bien.dpe] || '#94a3b8', color: 'white', fontWeight: 800, fontSize: 18, padding: '4px 14px', borderRadius: 8 }}>
                    {bien.dpe}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* DESCRIPTION */}
        {bien.description && (
          <div style={{ background: 'white', borderRadius: 16, padding: 32, boxShadow: '0 8px 32px rgba(26,35,50,0.08)', marginBottom: 24 }}>
            <div style={{ fontSize: 11, color: DORE, letterSpacing: 2, textTransform: 'uppercase', fontWeight: 700, marginBottom: 16 }}>Description</div>
            <p style={{ fontSize: 15, color: '#334155', lineHeight: 1.8, margin: 0, whiteSpace: 'pre-wrap' }}>
              {bien.description}
            </p>
          </div>
        )}

        {/* GALERIE */}
        {autresPhotos.length > 0 && (
          <div style={{ background: 'white', borderRadius: 16, padding: 32, boxShadow: '0 8px 32px rgba(26,35,50,0.08)', marginBottom: 24 }}>
            <div style={{ fontSize: 11, color: DORE, letterSpacing: 2, textTransform: 'uppercase', fontWeight: 700, marginBottom: 16 }}>Galerie</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 12 }}>
              {autresPhotos.map((url, i) => (
                <div key={i} style={{ position: 'relative', paddingBottom: '70%', borderRadius: 10, overflow: 'hidden', background: FOND }}>
                  <img src={url} alt={`Photo ${i + 2}`} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }} />
                </div>
              ))}
            </div>
          </div>
        )}

        {/* CONTACT */}
        <div style={{ background: BLEU, borderRadius: 16, padding: 36, color: 'white', textAlign: 'center', boxShadow: '0 8px 32px rgba(26,35,50,0.2)' }}>
          <div style={{ fontSize: 11, color: DORE, letterSpacing: 2, textTransform: 'uppercase', fontWeight: 700, marginBottom: 12 }}>Une question ? Une visite ?</div>
          <div style={{ fontSize: 22, fontWeight: 700, marginBottom: 6 }}>Alexandre ROGELET</div>
          <div style={{ fontSize: 14, opacity: 0.85, marginBottom: 24 }}>Votre chasseur Emilio Immobilier</div>
          <div style={{ display: 'flex', justifyContent: 'center', gap: 12, flexWrap: 'wrap' }}>
            <a href="tel:+33658957632" style={{ background: DORE, color: BLEU, padding: '12px 28px', borderRadius: 30, textDecoration: 'none', fontWeight: 700, fontSize: 14, display: 'inline-flex', alignItems: 'center', gap: 8 }}>
              📞 06 58 95 76 32
            </a>
            <a href="mailto:arogelet@emilio-immo.com" style={{ background: 'rgba(255,255,255,0.1)', color: 'white', padding: '12px 28px', borderRadius: 30, textDecoration: 'none', fontWeight: 600, fontSize: 14, border: '1px solid rgba(255,255,255,0.3)', display: 'inline-flex', alignItems: 'center', gap: 8 }}>
              ✉️ Me contacter
            </a>
          </div>
        </div>
      </main>

      {/* FOOTER */}
      <footer style={{ background: BLEU, padding: '32px 24px', marginTop: 60, textAlign: 'center', color: 'rgba(255,255,255,0.6)', fontSize: 12, borderTop: `1px solid rgba(201,168,76,0.3)` }}>
        <div style={{ maxWidth: 1100, margin: '0 auto' }}>
          <div style={{ marginBottom: 8 }}>
            <strong style={{ color: DORE }}>Emilio Immobilier</strong> · Chasse immobilière sur mesure
          </div>
          <div>Ce document est strictement confidentiel et destiné au client mandant.</div>
        </div>
      </footer>
    </div>
  );
}
