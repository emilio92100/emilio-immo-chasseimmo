import { createClient } from '@supabase/supabase-js';
import { notFound } from 'next/navigation';
import Image from 'next/image';
import PhotoCarousel from './PhotoCarousel';
import AboutPliable from './AboutPliable';

/*
 * La fiche publique d'un bien — /bien/<id>
 *
 * C'est la page qu'un client envoie à son conjoint, à ses parents ou à son
 * courtier depuis le bouton « Partager » de son espace : ces gens-là n'ont pas
 * de lien d'espace, donc cette page reste ouverte à tous.
 *
 * Elle reprend exactement la trame de la fiche du bien dans l'espace acheteur
 * (mêmes cartes, mêmes rubriques, mêmes jetons de couleur), à une différence
 * près : pas de boutons d'avis. Celui qui reçoit le lien n'est pas le client,
 * il n'a rien à répondre — on lui donne les moyens d'appeler, c'est tout.
 */

export const dynamic = 'force-dynamic';

/* ⚠️ La clé de service, pas la clé publique.
   Cette page est publique, mais elle est rendue par le SERVEUR : la clé ne
   quitte jamais Vercel, le navigateur du visiteur ne la voit pas. C'est ce
   qui lui permet de continuer à lire un bien une fois le RLS allumé — la clé
   publique, elle, n'aura plus le droit de rien (voir migration-rls.sql).
   Le repli sur la clé publique reste là pour le développement local. */
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

/* Les jetons de l'espace acheteur, repris à l'identique. */
const ENCRE = '#1a2332';
const ENCRE_NUIT = '#131b27';
const OR = '#c9a84c';
const OR_FONCE = '#a9822f';
const OR_FOND = '#fdfaf1';
const OR_TRAIT = '#ecdcb4';
const FOND = '#f4f6fa';
const CARTE = '#ffffff';
const TRAIT = '#e3e8f0';
const PLUME = '#64748b';
const PLUME_CLAIR = '#98a4b6';
const OMBRE = '0 1px 2px rgba(16,24,40,.04), 0 10px 26px -20px rgba(16,24,40,.3)';

const DPEC: Record<string, string> = {
  A: '#319834', B: '#4ab84a', C: '#a8d84a', D: '#f7e017',
  E: '#f5b912', F: '#ee8235', G: '#e2231a',
};

const JAKARTA = "'Plus Jakarta Sans', system-ui, sans-serif";

const nb = (v: number | string) => String(v).replace('.', ',');
const fmt = (n?: number | null) =>
  n === null || n === undefined ? null : new Intl.NumberFormat('fr-FR').format(n);


/* Les mêmes icônes que dans l'espace acheteur, dessinées à la main et posées
   ici en SVG : aucune police externe à charger, et surtout un trait identique
   des deux côtés. Une fiche partagée doit ressembler à la fiche d'origine. */
const T: Record<string, string[]> = {
  terrasse: ['M3 15h18', 'M3 21h18', 'M4.5 15v6', 'M9.5 15v6', 'M14.5 15v6', 'M19.5 15v6'],
  jardin: ['c:12,9,5', 'M12 14v7', 'M8.6 17.4 12 18.8l3.4-1.4'],
  parking: ['M4 16.5h16', 'M6.2 16.5v2', 'M17.8 16.5v2', 'M5.6 16.5v-4l1.9-4.2h9l1.9 4.2v4', 'M5.6 12.5h12.8'],
  cave: ['M4 19.5h4v-4h4v-4h4v-4h4', 'M4 19.5V17'],
  ascenseur: ['M6.2 3.5h11.6v17H6.2z', 'm10 10 2-2.6 2 2.6', 'm10 14 2 2.6 2-2.6'],
  gardien: ['M12 3.4 5.2 6.3v5.4c0 4.1 2.8 7.4 6.8 8.5 4-1.1 6.8-4.4 6.8-8.5V6.3z'],
  cuisine: ['M3.6 6.6h16.8v11.4H3.6z', 'M3.6 13.4h16.8', 'c:8.4,10,1.5', 'c:15.6,10,1.5'],
  clim: ['M12 3.4v17.2', 'M4.5 7.8 19.5 16.2', 'M19.5 7.8 4.5 16.2', 'm9.2 5.2 2.8 2 2.8-2', 'm9.2 18.8 2.8-2 2.8 2'],
  traversant: ['M3.2 12h17.6', 'm7.4 7.8-4 4.2 4 4.2', 'm16.6 7.8 4 4.2-4 4.2'],
  lieu: ['M12 21.5S19 15 19 10a7 7 0 1 0-14 0c0 5 7 11.5 7 11.5z', 'c:12,10,2.6'],
  euro: ['M17 6.5A6.5 6.5 0 0 0 7.5 12 6.5 6.5 0 0 0 17 17.5', 'M4 10.5h8', 'M4 13.5h8'],
  maison: ['M3 21h18', 'M5 21V9.5L12 4l7 5.5V21', 'M10 21v-6h4v6'],
  immeuble: ['M4 21V4h9v17', 'M13 10h7v11', 'M7 8h2', 'M7 12h2', 'M7 16h2', 'M16 14h1', 'M16 18h1'],
  eclair: ['M13 2 4.8 13.4h5.9L9.8 22 19.2 10.4H13z'],
  etincelle: ['M11 3l1.7 4.6L17 9.3l-4.3 1.7L11 15.6 9.3 11 5 9.3l4.3-1.7z', 'M18 15l.6 1.6 1.6.6-1.6.6-.6 1.6-.6-1.6-1.6-.6 1.6-.6z'],
  tel: ['M6.2 3h3.1l1.5 3.9-2 1.3a13.4 13.4 0 0 0 6.9 6.9l1.3-2 3.9 1.5v3.1a1.9 1.9 0 0 1-2.1 1.9A17.6 17.6 0 0 1 3.1 5.1 1.9 1.9 0 0 1 5 3z'],
  mail: ['M3.6 6.6h16.8v10.8H3.6z', 'm3.6 7 8.4 5.9 8.4-5.9'],
  regle: ['M2.8 9.2h18.4v5.6H2.8z', 'M7 9.2v2.6', 'M12 9.2v3.4', 'M17 9.2v2.6'],
  plan: ['M3.5 3.5h17v17h-17z', 'M3.5 10.5h17', 'M10.5 10.5v10'],
  lit: ['M3.2 19v-9', 'M3.2 14.6h17.6V19', 'M20.8 14.6v-2.4a2.4 2.4 0 0 0-2.4-2.4h-6.4v4.8', 'c:7.2,11.6,1.9'],
  soleil: ['c:12,12,3.9', 'M12 3.2v2.2', 'M12 18.6v2.2', 'M3.2 12h2.2', 'M18.6 12h2.2', 'm5.9 5.9 1.6 1.6', 'm16.5 16.5 1.6 1.6', 'm18.1 5.9-1.6 1.6', 'm7.5 16.5-1.6 1.6'],
  sejour: ['M3.4 12.4a1.9 1.9 0 0 1 3.8 0v2.4h9.6v-2.4a1.9 1.9 0 0 1 3.8 0V18H3.4z', 'M7.2 14.8V9.6a1.9 1.9 0 0 1 1.9-1.9h5.8a1.9 1.9 0 0 1 1.9 1.9v5.2', 'M6 18v2', 'M18 18v2'],
  calendrier: ['M4 6.6h16v14H4z', 'M4 10.6h16', 'M8.4 3.6v4', 'M15.6 3.6v4'],
};

function Ico({ n, t = 22 }: { n: string; t?: number }) {
  const d = T[n];
  if (!d) return null;
  return (
    <svg width={t} height={t} viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round"
      style={{ display: 'block', flex: '0 0 auto' }} aria-hidden="true">
      {d.map((x, i) => x.startsWith('c:')
        ? (([cx, cy, r]) => <circle key={i} cx={cx} cy={cy} r={r} />)(x.slice(2).split(','))
        : <path key={i} d={x} />)}
    </svg>
  );
}

/* Le petit intitulé gris au-dessus de chaque rubrique, comme dans l'espace. */
function Titre({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      fontSize: 10, letterSpacing: 1.3, textTransform: 'uppercase',
      color: PLUME_CLAIR, fontWeight: 800, margin: '26px 0 10px',
    }}>{children}</div>
  );
}

export default async function PageBien({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const { data: bien } = await supabase.from('biens').select('*').eq('id', id).maybeSingle();
  if (!bien) notFound();

  const prix = bien.prix_acquereur || bien.prix_vendeur;
  const labelPrix = bien.prix_acquereur ? 'Prix FAI · honoraires inclus' : 'Prix';
  const prixM2 = prix && bien.surface ? Math.round(prix / bien.surface) : null;
  const photos: string[] = Array.isArray(bien.photos) ? bien.photos.filter(Boolean) : [];
  const lieu = [bien.quartier || bien.adresse_probable, bien.ville, bien.code_postal]
    .filter(Boolean).join(', ');

  /* La surface d'extérieur est parfois saisie en bloc, parfois balcon par
     terrasse : on prend le total quand il existe, la somme sinon. */
  const ext = bien.surface_exterieur
    || ((Number(bien.surface_terrasse) || 0) + (Number(bien.surface_balcon) || 0))
    || null;

  const chiffres: { i: string; v: string; l: string }[] = [];
  if (bien.surface) chiffres.push({ i: 'regle', v: `${nb(bien.surface)} m²`, l: 'Surface' });
  if (bien.nb_pieces) chiffres.push({ i: 'plan', v: String(bien.nb_pieces), l: bien.nb_pieces > 1 ? 'Pièces' : 'Pièce' });
  if (bien.nb_chambres) chiffres.push({ i: 'lit', v: String(bien.nb_chambres), l: bien.nb_chambres > 1 ? 'Chambres' : 'Chambre' });
  if (bien.etage !== null && bien.etage !== undefined) {
    chiffres.push({
      i: 'immeuble',
      v: bien.etage === 0 ? 'RDC' : `${bien.etage}e${bien.etage_total ? '/' + bien.etage_total : ''}`,
      l: 'Étage',
    });
  }
  if (bien.exposition) chiffres.push({ i: 'soleil', v: String(bien.exposition), l: 'Exposition' });
  if (bien.surface_sejour) chiffres.push({ i: 'sejour', v: `${nb(bien.surface_sejour)} m²`, l: 'Séjour' });
  if (ext) chiffres.push({ i: 'terrasse', v: `${nb(ext)} m²`, l: 'Extérieur' });
  if (bien.annee_construction) chiffres.push({ i: 'calendrier', v: String(bien.annee_construction), l: 'Construction' });

  const inclus: { i: string; n: string }[] = [];
  if (bien.terrasse) inclus.push({ i: 'terrasse', n: 'Terrasse' });
  if (bien.balcon) inclus.push({ i: 'terrasse', n: 'Balcon' });
  if (bien.jardin) inclus.push({ i: 'jardin', n: 'Jardin' });
  if (bien.parking) inclus.push({ i: 'parking', n: bien.nb_parking > 1 ? `${bien.nb_parking} parkings` : 'Parking' });
  if (bien.cave) inclus.push({ i: 'cave', n: 'Cave' });
  if (bien.ascenseur) inclus.push({ i: 'ascenseur', n: 'Ascenseur' });
  if (bien.gardien) inclus.push({ i: 'gardien', n: 'Gardien' });
  if (bien.cuisine_equipee) inclus.push({ i: 'cuisine', n: 'Cuisine équipée' });
  if (bien.climatisation) inclus.push({ i: 'clim', n: 'Climatisation' });
  if (bien.traversant) inclus.push({ i: 'traversant', n: 'Traversant' });

  /* Les charges se saisissent au trimestre dans le CRM : on l'écrit tel quel
     plutôt que de multiplier par quatre un chiffre dont on n'est pas sûr. */
  const couts: { i: string; l: string; v: string; u: string }[] = [];
  if (bien.charges_trimestrielles) couts.push({ i: 'euro', l: 'Charges', v: `${fmt(bien.charges_trimestrielles)} €`, u: 'par trimestre' });
  if (bien.taxe_fonciere) couts.push({ i: 'immeuble', l: 'Taxe foncière', v: `${fmt(bien.taxe_fonciere)} €`, u: 'par an' });
  if (bien.chauffage) couts.push({ i: 'eclair', l: 'Chauffage', v: String(bien.chauffage), u: '' });
  if (bien.nb_lots) couts.push({ i: 'maison', l: 'Copropriété', v: String(bien.nb_lots), u: bien.nb_lots > 1 ? 'lots' : 'lot' });

  const lettre = (v?: string | null) => {
    const k = v ? String(v).toUpperCase()[0] : '';
    return k && DPEC[k] ? k : null;
  };
  const lDpe = lettre(bien.dpe), lGes = lettre(bien.ges);

  const carte: React.CSSProperties = {
    background: CARTE, border: `1px solid ${TRAIT}`, borderRadius: 15, padding: '13px 14px',
  };

  return (
    <div style={{ minHeight: '100vh', background: FOND, color: ENCRE, fontFamily: "'DM Sans', system-ui, sans-serif" }}>
      <style>{`
        html,body{height:auto!important;min-height:100%!important;overflow-x:hidden!important}
        .fb-grille{display:grid; grid-template-columns:repeat(auto-fit,minmax(96px,1fr)); gap:9px}
        .fb-cartes{display:grid; grid-template-columns:repeat(auto-fit,minmax(152px,1fr)); gap:9px}
        .fb-corps{max-width:760px; margin:0 auto; padding:0 20px 56px}
        .fb-prix{display:flex; align-items:baseline; justify-content:space-between; gap:14px; flex-wrap:wrap}
        @media(max-width:600px){ .fb-h1{font-size:23px!important} .fb-corps{padding:0 16px 44px} }
      `}</style>

      <header style={{ background: ENCRE, padding: '16px 0', borderBottom: `2px solid ${OR}` }}>
        <div style={{ maxWidth: 760, margin: '0 auto', padding: '0 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 14 }}>
          <Image src="/logo_high_resolution_white.png" alt="Emilio Immobilier" width={280} height={64} style={{ height: 46, width: 'auto' }} priority />
          <div style={{ color: OR, fontSize: 10, letterSpacing: 2.4, fontWeight: 700 }}>SÉLECTION PRIVÉE</div>
        </div>
      </header>

      {/* Les photos, bord à bord comme dans l'espace */}
      <div style={{ background: ENCRE }}>
        <div style={{ maxWidth: 760, margin: '0 auto' }}>
          <PhotoCarousel photos={photos} />
        </div>
      </div>

      <div className="fb-corps">

        {/* Le prix d'abord : c'est la première question de celui qui reçoit le lien */}
        <div className="fb-prix" style={{ padding: '20px 0 2px' }}>
          <span style={{ fontFamily: JAKARTA, fontSize: 30, fontWeight: 800, color: OR_FONCE, letterSpacing: -.8 }}>
            {fmt(prix) || '—'} €
          </span>
          {prixM2 ? (
            <span style={{ fontSize: 13.5, color: PLUME_CLAIR, fontWeight: 700 }}>{fmt(prixM2)} €/m²</span>
          ) : null}
        </div>
        <div style={{ fontSize: 11.5, color: OR, fontWeight: 700, marginBottom: 14 }}>{labelPrix}</div>

        <h1 className="fb-h1" style={{ fontFamily: JAKARTA, fontSize: 25, fontWeight: 800, letterSpacing: -.5, lineHeight: 1.25, margin: '0 0 6px' }}>
          {bien.titre || `${bien.type_bien || 'Bien'}${bien.surface ? ` — ${bien.surface} m²` : ''}`}
        </h1>
        {lieu && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13.5, color: PLUME }}>
            <span style={{ color: OR, display: 'flex' }}><Ico n="lieu" t={15} /></span>{lieu}
          </div>
        )}

        {chiffres.length > 0 && (
          <div className="fb-grille" style={{ margin: '20px 0 4px' }}>
            {chiffres.map((c) => (
              <div key={c.l} style={{
                background: CARTE, border: `1px solid ${TRAIT}`, borderRadius: 15,
                padding: '14px 8px 12px', textAlign: 'center', boxShadow: OMBRE,
              }}>
                <span style={{ color: OR, display: 'flex', justifyContent: 'center', marginBottom: 8 }}>
                  <Ico n={c.i} t={19} />
                </span>
                <div style={{ fontFamily: JAKARTA, fontWeight: 800, fontSize: 17, letterSpacing: -.3, lineHeight: 1.15 }}>{c.v}</div>
                <div style={{ fontSize: 9, letterSpacing: .9, textTransform: 'uppercase', color: PLUME_CLAIR, marginTop: 5, fontWeight: 700 }}>{c.l}</div>
              </div>
            ))}
          </div>
        )}

        {(lDpe || lGes) && (
          <>
            <Titre>Performance énergétique</Titre>
            <div className="fb-cartes">
              {lDpe && (
                <div style={carte}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 7, color: PLUME_CLAIR }}>
                    <Ico n="eclair" t={15} />
                    <span style={{ fontSize: 9.5, letterSpacing: 1, textTransform: 'uppercase', fontWeight: 800 }}>DPE</span>
                  </div>
                  <div style={{ marginTop: 8 }}>
                    <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 36, height: 36, borderRadius: 11, background: DPEC[lDpe], color: ENCRE, fontFamily: JAKARTA, fontWeight: 800, fontSize: 18 }}>{lDpe}</span>
                  </div>
                  {bien.dpe_conso ? <div style={{ fontSize: 11, color: PLUME_CLAIR, fontWeight: 700, marginTop: 6 }}>{bien.dpe_conso} kWh/m².an</div> : null}
                </div>
              )}
              {lGes && (
                <div style={carte}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 7, color: PLUME_CLAIR }}>
                    <Ico n="etincelle" t={15} />
                    <span style={{ fontSize: 9.5, letterSpacing: 1, textTransform: 'uppercase', fontWeight: 800 }}>GES</span>
                  </div>
                  <div style={{ marginTop: 8 }}>
                    <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 36, height: 36, borderRadius: 11, background: DPEC[lGes], color: ENCRE, fontFamily: JAKARTA, fontWeight: 800, fontSize: 18 }}>{lGes}</span>
                  </div>
                  {bien.ges_emissions ? <div style={{ fontSize: 11, color: PLUME_CLAIR, fontWeight: 700, marginTop: 6 }}>{bien.ges_emissions} kg CO₂/m².an</div> : null}
                </div>
              )}
            </div>
          </>
        )}

        {bien.description && (
          <div style={{ marginTop: 20 }}>
            <AboutPliable text={bien.description} />
          </div>
        )}

        {inclus.length > 0 && (
          <>
            <Titre>Ce que le bien comprend</Titre>
            <div className="fb-cartes">
              {inclus.map((x) => (
                <div key={x.n} style={{ ...carte, display: 'flex', alignItems: 'center', gap: 11, padding: '11px 13px' }}>
                  <span style={{ width: 34, height: 34, borderRadius: 11, background: FOND, color: OR, display: 'flex', alignItems: 'center', justifyContent: 'center', flex: '0 0 auto' }}>
                    <Ico n={x.i} t={19} />
                  </span>
                  <span style={{ fontFamily: JAKARTA, fontWeight: 700, fontSize: 13.5, lineHeight: 1.25 }}>{x.n}</span>
                </div>
              ))}
            </div>
          </>
        )}

        {couts.length > 0 && (
          <>
            <Titre>Charges et énergie</Titre>
            <div className="fb-cartes">
              {couts.map((c) => (
                <div key={c.l} style={carte}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 7, color: PLUME_CLAIR }}>
                    <Ico n={c.i} t={15} />
                    <span style={{ fontSize: 9.5, letterSpacing: 1, textTransform: 'uppercase', fontWeight: 800 }}>{c.l}</span>
                  </div>
                  <div style={{ fontFamily: JAKARTA, fontWeight: 800, fontSize: 18, marginTop: 8, lineHeight: 1.2 }}>
                    {c.v}
                    {c.u ? <span style={{ display: 'block', fontFamily: "'DM Sans', sans-serif", fontSize: 11, color: PLUME_CLAIR, fontWeight: 700, marginTop: 3, letterSpacing: .3 }}>{c.u}</span> : null}
                  </div>
                </div>
              ))}
            </div>
          </>
        )}

        {/* Celui qui reçoit ce lien ne peut pas répondre dans l'application :
            on lui donne de quoi appeler, et c'est tout ce qu'on lui demande. */}
        <section style={{ background: ENCRE, borderRadius: 22, padding: '32px 24px', color: '#fff', textAlign: 'center', marginTop: 30 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12, marginBottom: 18 }}>
            <div style={{ width: 48, height: 48, borderRadius: '50%', background: 'rgba(201,168,76,.15)', color: OR, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: JAKARTA, fontWeight: 800, fontSize: 15, border: `1px solid rgba(201,168,76,.4)` }}>AR</div>
            <div style={{ textAlign: 'left' }}>
              <div style={{ fontFamily: JAKARTA, fontSize: 15, fontWeight: 800 }}>Alexandre Rogelet</div>
              <div style={{ fontSize: 12, color: OR }}>Emilio Immobilier</div>
            </div>
          </div>
          <h2 style={{ fontFamily: JAKARTA, fontSize: 21, fontWeight: 800, margin: '0 0 8px', letterSpacing: -.3 }}>Ce bien vous intéresse&nbsp;?</h2>
          <div style={{ fontSize: 14, opacity: .72, marginBottom: 22, lineHeight: 1.6 }}>
            Appelez-moi pour organiser une visite, je reste à votre disposition.
          </div>
          <div style={{ display: 'flex', gap: 10, justifyContent: 'center', flexWrap: 'wrap' }}>
            <a href="tel:+33658957632" style={{ display: 'inline-flex', alignItems: 'center', gap: 8, background: OR, color: ENCRE, padding: '14px 26px', borderRadius: 14, fontFamily: JAKARTA, fontWeight: 800, fontSize: 14, textDecoration: 'none' }}>
              <Ico n="tel" t={16} />06 58 95 76 32
            </a>
            <a href="mailto:arogelet@emilio-immo.com" style={{ display: 'inline-flex', alignItems: 'center', gap: 8, background: 'rgba(255,255,255,.08)', color: '#fff', padding: '14px 26px', borderRadius: 14, fontFamily: JAKARTA, fontWeight: 700, fontSize: 14, textDecoration: 'none', border: '1px solid rgba(255,255,255,.25)' }}>
              <Ico n="mail" t={16} />Me contacter
            </a>
          </div>
        </section>

        <div style={{ marginTop: 18, background: OR_FOND, border: `1px solid ${OR_TRAIT}`, borderRadius: 15, padding: '13px 15px', fontSize: 12.5, color: OR_FONCE, lineHeight: 1.6, boxShadow: OMBRE }}>
          Document non contractuel. Les surfaces, charges et diagnostics sont communiqués sous réserve
          de vérification par les diagnostics, le règlement de copropriété et les documents notariés.
        </div>
      </div>

      <footer style={{ background: ENCRE_NUIT, padding: '24px 20px', borderTop: '1px solid rgba(201,168,76,.2)' }}>
        <div style={{ maxWidth: 760, margin: '0 auto', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
          <Image src="/logo_high_resolution_white.png" alt="Emilio Immobilier" width={220} height={50} style={{ height: 38, width: 'auto' }} />
          <div style={{ color: 'rgba(255,255,255,.55)', fontSize: 11.5, lineHeight: 1.7 }}>
            <span style={{ fontFamily: JAKARTA, fontWeight: 800, color: OR }}>Emilio Immobilier</span>
            <span style={{ color: 'rgba(255,255,255,.4)' }}> — RT Conseils (SAS)</span>
            <br />
            <span style={{ color: 'rgba(255,255,255,.4)' }}>Paris &amp; Hauts-de-Seine · Carte professionnelle CPI 9201 2020 000 045 344</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
