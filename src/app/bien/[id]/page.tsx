import { createClient } from '@supabase/supabase-js';
import { notFound } from 'next/navigation';
import Image from 'next/image';
import PhotoCarousel from './PhotoCarousel';
import AboutPliable from './AboutPliable';
import { versBienAcheteur, type BienVente } from '@/lib/biens-vente';

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
 *
 * V3.131 (Alexandre : « il appuie sur voir le bien, et ça arrive sur le lien
 * public, comme si un acheteur faisait partager ») : un bien de l'agence
 * (rubrique Biens, table biens_vente) a aussi la sienne, à son propre id —
 * un lien par bien, qui ne change jamais. C'est elle que porte le bouton
 * « Voir le bien » du mail envoyé à quelqu'un hors du CRM. Elle montre ce
 * que montrerait la copie dans le dossier d'un acheteur (versBienAcheteur) :
 * pas d'adresse exacte, pas de propriétaire, pas de prix avant le mandat.
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
const ENCRE = '#13243D';
const ENCRE_NUIT = '#1B3D6B';
/* V3.116 : les aplats sombres en bleu de la marque, comme le site emilio-immo.com. */
const MARQUE = '#22497D';
const OR = '#E68B23';
const OR_FONCE = '#A95808';
const OR_FOND = '#FFF6EC';
const OR_TRAIT = '#F7D5B0';
const FOND = '#F5F8FC';
const CARTE = '#ffffff';
const TRAIT = '#E8EDF3';
const PLUME = '#5B6B80';
const PLUME_CLAIR = '#8FA3BF';
const OMBRE = '0 1px 2px rgba(19,36,61,.04), 0 10px 26px -20px rgba(19,36,61,.3)';

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
  cle: ['c:8,15,4', 'M10.8 12.2 20 3.5', 'M16.5 7l3 3'],
};

/* V3.50 : le bien a-t-il encore sa place ? Lu sur la vente qu'il copie
   (rubrique Biens), comme l'espace acheteur. Avant, un bien vendu ou retiré
   s'affichait ici comme disponible, prix et « Sélection privée » compris. */
type Etat = 'vendu' | 'compromis' | 'retire';
const BANDEAU: Record<Etat, { titre: string; sous: string; ic: string; c: string; fond: string; trait: string }> = {
  vendu: { titre: 'Ce bien a été vendu', sous: 'Il n’est plus disponible.', ic: 'cle', c: ENCRE, fond: '#E8EFF8', trait: '#C9D5E6' },
  compromis: { titre: 'Sous compromis', sous: 'Une promesse de vente est signée : il n’est plus disponible pour l’instant.', ic: 'cle', c: OR_FONCE, fond: OR_FOND, trait: OR_TRAIT },
  retire: { titre: 'Ce bien n’est plus en vente', sous: 'Il n’est plus proposé pour l’instant.', ic: 'maison', c: PLUME, fond: FOND, trait: TRAIT },
};
function etatDeVente(v: { etape?: string | null; archive?: boolean | null } | null): Etat | null {
  if (!v) return null;
  if (v.etape === 'vendu') return 'vendu';
  if (v.etape === 'compromis') return 'compromis';
  if (v.etape === 'retire' || v.etape === 'suspendu' || v.archive) return 'retire';
  return null;
}

/* Les coordonnées du conseiller : celles des Paramètres (« Tes coordonnées
   dans les mails »), comme la signature des mails ; celles d'avant si elles
   sont vides. */
const TEL_DEFAUT = '06 58 95 76 32';
const MAIL_DEFAUT = 'arogelet@emilio-immo.com';
function lienTel(t: string): string {
  const n = t.replace(/[^\d+]/g, '');
  return /^0\d{9}$/.test(n) ? `+33${n.slice(1)}` : n;
}

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

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let { data: bien } = await supabase.from('biens').select('*').eq('id', id).maybeSingle() as { data: any };
  /* V3.131 : pas une copie d'acheteur ? Peut-être un bien de l'agence. */
  let venteDirecte: { etape?: string | null; archive?: boolean | null } | null = null;
  if (!bien) {
    const { data: v } = await supabase.from('biens_vente').select('*').eq('id', id).maybeSingle();
    if (!v) notFound();
    const vente = v as BienVente;
    bien = { id: vente.id, ...versBienAcheteur(vente, { clientId: '', rechercheId: '', quand: '' }) };
    venteDirecte = { etape: vente.etape, archive: vente.archive };
  }

  /* Un bien encore « en sélection » (pas encore présenté) reste lisible : un
     lien peut déjà être parti (WhatsApp à plusieurs, lien copié) avant que le
     bien passe « présenté », ou il a pu revenir en sélection après l'envoi.
     Le cacher casserait des liens déjà donnés au client. */
  const [venteLue, reglagesLus] = await Promise.all([
    venteDirecte ? Promise.resolve({ data: venteDirecte, error: null })
      : bien.bien_vente_id
      ? supabase.from('biens_vente').select('etape, archive').eq('id', bien.bien_vente_id).maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    supabase.from('parametres').select('cle, valeur').in('cle', ['conseiller_telephone', 'conseiller_email']),
  ]);
  if (venteLue.error) console.error('[bien public] état de la vente', venteLue.error.message);
  const etat = etatDeVente(venteLue.data as { etape?: string | null; archive?: boolean | null } | null);
  const bandeau = etat ? BANDEAU[etat] : null;
  const reglages = Object.fromEntries(((reglagesLus.data || []) as { cle: string; valeur: string | null }[]).map(r => [r.cle, (r.valeur || '').trim()]));
  const telConseiller = reglages.conseiller_telephone || TEL_DEFAUT;
  const mailConseiller = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(reglages.conseiller_email || '') ? reglages.conseiller_email : MAIL_DEFAUT;

  const prix = bien.prix_acquereur || bien.prix_vendeur;
  const labelPrix = bien.prix_acquereur ? 'Prix FAI · honoraires inclus' : 'Prix';
  const prixM2 = prix && bien.surface ? Math.round(prix / bien.surface) : null;
  const photos: string[] = Array.isArray(bien.photos) ? bien.photos.filter(Boolean) : [];
  const plans: string[] = Array.isArray(bien.plans) ? bien.plans.filter(Boolean) : [];
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
    <div style={{ minHeight: '100vh', background: FOND, color: ENCRE, fontFamily: "system-ui, sans-serif" }}>
      <style>{`
        html,body{height:auto!important;min-height:100%!important;overflow-x:hidden!important}
        .fb-grille{display:grid; grid-template-columns:repeat(auto-fit,minmax(96px,1fr)); gap:9px}
        .fb-cartes{display:grid; grid-template-columns:repeat(auto-fit,minmax(152px,1fr)); gap:9px}
        .fb-corps{max-width:760px; margin:0 auto; padding:0 20px 56px}
        .fb-prix{display:flex; align-items:baseline; justify-content:space-between; gap:14px; flex-wrap:wrap}
        @media(max-width:600px){ .fb-h1{font-size:23px!important} .fb-corps{padding:0 16px 44px} }
      `}</style>

      <header style={{ background: MARQUE, padding: '16px 0', borderBottom: `2px solid ${OR}` }}>
        <div style={{ maxWidth: 760, margin: '0 auto', padding: '0 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 14 }}>
          <Image src="/logo_high_resolution_white.png" alt="Emilio Immobilier" width={280} height={64} style={{ height: 46, width: 'auto' }} priority />
          {!bandeau && <div style={{ color: OR, fontSize: 10, letterSpacing: 2.4, fontWeight: 700 }}>SÉLECTION PRIVÉE</div>}
        </div>
      </header>

      {/* Les photos, bord à bord comme dans l'espace */}
      <div style={{ background: MARQUE }}>
        <div style={{ maxWidth: 760, margin: '0 auto' }}>
          <PhotoCarousel photos={photos} />
        </div>
      </div>

      <div className="fb-corps">

        {/* Vendu, sous compromis, plus en vente : dit avant tout le reste. */}
        {bandeau && (
          <div role="status" style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 18, padding: '14px 16px', borderRadius: 15, background: bandeau.fond, border: `1px solid ${bandeau.trait}`, color: bandeau.c, boxShadow: OMBRE }}>
            <span style={{ width: 38, height: 38, borderRadius: 12, background: CARTE, display: 'flex', alignItems: 'center', justifyContent: 'center', flex: '0 0 auto' }}><Ico n={bandeau.ic} t={19} /></span>
            <span style={{ minWidth: 0 }}>
              <span style={{ display: 'block', fontFamily: JAKARTA, fontWeight: 800, fontSize: 16, letterSpacing: -.2 }}>{bandeau.titre}</span>
              <span style={{ display: 'block', fontSize: 13, color: PLUME, marginTop: 2, lineHeight: 1.45 }}>{bandeau.sous}</span>
            </span>
          </div>
        )}

        {/* Le prix d'abord : c'est la première question de celui qui reçoit le lien */}
        <div className="fb-prix" style={{ padding: '20px 0 2px' }}>
          <span style={{ fontFamily: JAKARTA, fontSize: 30, fontWeight: 800, color: OR_FONCE, letterSpacing: -.8 }}>
            {prix ? `${fmt(prix)} €` : 'Prix à venir'}
          </span>
          {prixM2 ? (
            <span style={{ fontSize: 13.5, color: PLUME_CLAIR, fontWeight: 700 }}>{fmt(prixM2)} €/m²</span>
          ) : null}
        </div>
        {/* V3.113 : sans prix (un bien de l'agence avant le mandat), pas de mention sous « Prix à venir ». */}
        <div style={{ fontSize: 11.5, color: OR, fontWeight: 700, marginBottom: 14 }}>{prix ? labelPrix : ''}</div>

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

        {plans.length > 0 && (
          <>
            <Titre>{plans.length > 1 ? 'Les plans' : 'Le plan'}</Titre>
            <div style={{ display: 'grid', gap: 10 }}>
              {plans.map((u, n) => (
                <a key={u + n} href={u} target="_blank" rel="noopener noreferrer"
                  style={{ ...carte, display: 'block', background: '#fff', padding: 12, cursor: 'zoom-in' }}>
                  <img src={u} alt={plans.length > 1 ? `Plan ${n + 1}` : 'Plan du bien'} loading="lazy"
                    style={{ display: 'block', width: '100%', maxHeight: 460, objectFit: 'contain', margin: '0 auto' }} />
                </a>
              ))}
            </div>
          </>
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
                    {c.u ? <span style={{ display: 'block', fontFamily: "sans-serif", fontSize: 11, color: PLUME_CLAIR, fontWeight: 700, marginTop: 3, letterSpacing: .3 }}>{c.u}</span> : null}
                  </div>
                </div>
              ))}
            </div>
            {bien.charges_trimestrielles && bien.charges_comprises ? (
              <p style={{ margin: '9px 2px 0', fontSize: 12.5, lineHeight: 1.5, color: PLUME }}>
                <b style={{ fontWeight: 700 }}>Compris dans les charges :</b> {bien.charges_comprises}
              </p>
            ) : null}
          </>
        )}

        {/* Celui qui reçoit ce lien ne peut pas répondre dans l'application :
            on lui donne de quoi appeler, et c'est tout ce qu'on lui demande. */}
        <section style={{ background: MARQUE, borderRadius: 22, padding: '32px 24px', color: '#fff', textAlign: 'center', marginTop: 30 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12, marginBottom: 18 }}>
            <div style={{ width: 48, height: 48, borderRadius: '50%', background: 'rgba(230,139,35,.15)', color: OR, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: JAKARTA, fontWeight: 800, fontSize: 15, border: `1px solid rgba(230,139,35,.4)` }}>AR</div>
            <div style={{ textAlign: 'left' }}>
              <div style={{ fontFamily: JAKARTA, fontSize: 15, fontWeight: 800 }}>Alexandre Rogelet</div>
              <div style={{ fontSize: 12, color: OR }}>Emilio Immobilier</div>
            </div>
          </div>
          <h2 style={{ fontFamily: JAKARTA, fontSize: 21, fontWeight: 800, margin: '0 0 8px', letterSpacing: -.3 }}>
            {etat === 'vendu' || etat === 'retire' ? 'Vous cherchez un bien comme celui-ci\u00a0?' : 'Ce bien vous intéresse\u00a0?'}
          </h2>
          <div style={{ fontSize: 14, opacity: .72, marginBottom: 22, lineHeight: 1.6 }}>
            {etat === 'vendu' || etat === 'retire' ? 'Appelez-moi : je vous aide à trouver le vôtre.'
              : etat === 'compromis' ? 'Il est sous compromis. Appelez-moi : je vous préviens s’il redevient disponible.'
              : 'Appelez-moi pour organiser une visite, je reste à votre disposition.'}
          </div>
          <div style={{ display: 'flex', gap: 10, justifyContent: 'center', flexWrap: 'wrap' }}>
            <a href={`tel:${lienTel(telConseiller)}`} style={{ display: 'inline-flex', alignItems: 'center', gap: 8, background: OR, color: ENCRE, padding: '14px 26px', borderRadius: 14, fontFamily: JAKARTA, fontWeight: 800, fontSize: 14, textDecoration: 'none' }}>
              <Ico n="tel" t={16} />{telConseiller}
            </a>
            <a href={`mailto:${mailConseiller}`} style={{ display: 'inline-flex', alignItems: 'center', gap: 8, background: 'rgba(255,255,255,.08)', color: '#fff', padding: '14px 26px', borderRadius: 14, fontFamily: JAKARTA, fontWeight: 700, fontSize: 14, textDecoration: 'none', border: '1px solid rgba(255,255,255,.25)' }}>
              <Ico n="mail" t={16} />Me contacter
            </a>
          </div>
        </section>

        <div style={{ marginTop: 18, background: OR_FOND, border: `1px solid ${OR_TRAIT}`, borderRadius: 15, padding: '13px 15px', fontSize: 12.5, color: OR_FONCE, lineHeight: 1.6, boxShadow: OMBRE }}>
          Document non contractuel. Les surfaces, charges et diagnostics sont communiqués sous réserve
          de vérification par les diagnostics, le règlement de copropriété et les documents notariés.
        </div>
      </div>

      <footer style={{ background: ENCRE_NUIT, padding: '24px 20px', borderTop: '1px solid rgba(230,139,35,.2)' }}>
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
