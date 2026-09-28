'use client';
import { typesDe, estPro } from '@/lib/contacts';

/* ═══ L'avatar d'un contact ═══════════════════════════════════════════════
   Une initiale seule (« R », « H ») ne disait pas grand-chose. L'avatar
   dessine maintenant une personne — deux pour un couple — dans la teinte
   du statut. Un professionnel (notaire, confrère, gardien…) porte une
   mallette : on voit d'un coup d'œil qui est un particulier.

   Deux dessins, au choix :
     · « silhouette »  sobre, une tête et des épaules ;
     · « personnage »  un petit personnage : visage, cheveux (plus longs pour
       « Madame »), la couleur des cheveux tirée de son nom pour qu'elle ne
       change pas d'un écran à l'autre. */

export type Teinte = { bg: string; fg: string; trait?: string };
export type VarianteAvatar = 'silhouette' | 'personnage' | 'lettre';

type Personne = {
  prenom?: string | null; nom?: string | null; civilite?: string | null;
  couple?: boolean | null; conjoint?: unknown; types?: unknown;
};

const CHEVEUX = ['#3a2c25', '#5b3d27', '#8a5a33', '#b98a4d', '#d8b46a', '#7d828c'];
function hash(t: string) { let h = 0; for (const ch of t) h = (h * 31 + ch.charCodeAt(0)) >>> 0; return h; }

const civ = (x: unknown) => (typeof x === 'string' ? x : '').toLowerCase();
const estMadame = (x: unknown) => /madame|mme/.test(civ(x));

function Silhouette({ c, x = 0, s = 1, o = 1 }: { c: string; x?: number; s?: number; o?: number }) {
  return (
    <g transform={`translate(${20 + x} 20) scale(${s}) translate(-20 -20)`} opacity={o}>
      <circle cx="20" cy="15" r="6.6" fill={c} />
      <path d="M7.5 39c1.3-8.2 6.3-12.4 12.5-12.4S31.2 30.8 32.5 39z" fill={c} />
    </g>
  );
}

function Personnage({ habit, cheveux, madame, x = 0, s = 1 }: { habit: string; cheveux: string; madame: boolean; x?: number; s?: number }) {
  return (
    <g transform={`translate(${20 + x} 20) scale(${s}) translate(-20 -20)`}>
      {madame && <path d="M11.2 23.5c-1.2-9.6 3-16.5 8.8-16.5s10 6.9 8.8 16.5c-1.4-.9-2.1-3.2-2.3-6.4-1.9-2.2-4.1-3.3-6.5-3.3s-4.6 1.1-6.5 3.3c-.2 3.2-.9 5.5-2.3 6.4z" fill={cheveux} />}
      <path d="M7.5 40c1.2-8 6.2-12 12.5-12s11.3 4 12.5 12z" fill={habit} />
      <rect x="17.6" y="23.2" width="4.8" height="5.2" rx="2" fill="#f3dcc1" />
      <circle cx="20" cy="17.6" r="7.4" fill="#fbead5" />
      {madame
        ? <path d="M12.8 17.2c.4-5.2 3.4-8.4 7.2-8.4s6.8 3.2 7.2 8.4c-2.2-1.8-4.4-3-7.2-3.4-2.8.4-5 1.6-7.2 3.4z" fill={cheveux} />
        : <path d="M12.4 16.8c0-5.6 3.3-8.9 7.6-8.9s7.6 3.3 7.6 8.9c-1.3-2.2-3.8-3.6-7.6-3.8-3.8.2-6.3 1.6-7.6 3.8z" fill={cheveux} />}
      <circle cx="17.3" cy="18.2" r=".95" fill="#34496e" />
      <circle cx="22.7" cy="18.2" r=".95" fill="#34496e" />
      <path d="M17.6 21.1c1.4 1.1 3.4 1.1 4.8 0" stroke="#c07a5a" strokeWidth="1.1" strokeLinecap="round" fill="none" />
    </g>
  );
}

function Mallette({ c }: { c: string }) {
  return (
    <g fill="none" stroke={c} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="10" y="15" width="20" height="14" rx="3" />
      <path d="M16 15v-2.2a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2V15M10 21h20" />
    </g>
  );
}

export default function AvatarContact({ c, teinte, taille = 38, variante = 'personnage', className, style }: {
  c: Personne; teinte: Teinte; taille?: number; variante?: VarianteAvatar;
  className?: string; style?: React.CSSProperties;
}) {
  const base: React.CSSProperties = {
    width: taille, height: taille, borderRadius: '50%', flexShrink: 0, overflow: 'hidden',
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
    background: teinte.bg, color: teinte.fg,
    boxShadow: teinte.trait ? `inset 0 0 0 2px ${teinte.trait}` : undefined, ...style,
  };
  if (variante === 'lettre') {
    return (
      <span className={className} style={{ ...base, fontFamily: "'Plus Jakarta Sans', sans-serif", fontSize: Math.round(taille * 0.4), fontWeight: 800 }}>
        {(c.prenom?.[0] || c.nom?.[0] || '?').toUpperCase()}
      </span>
    );
  }
  const pro = estPro(typesDe(c));
  const couple = !!c.couple;
  const conj = (c.conjoint && typeof c.conjoint === 'object' ? c.conjoint : {}) as { civilite?: unknown; prenom?: unknown };
  const nom = `${c.prenom || ''} ${c.nom || ''}`;
  const cheveux1 = CHEVEUX[hash(nom) % CHEVEUX.length];
  const cheveux2 = CHEVEUX[hash(`${nom}·${String(conj.prenom || '')}`) % CHEVEUX.length];
  return (
    <span className={className} style={base} aria-hidden="true">
      <svg width={taille} height={taille} viewBox="0 0 40 40">
        {pro ? <Mallette c={teinte.fg} />
          : variante === 'silhouette'
            ? (couple
              ? <><Silhouette c={teinte.fg} x={5.5} s={0.82} o={0.5} /><Silhouette c={teinte.fg} x={-3.5} s={0.9} /></>
              : <Silhouette c={teinte.fg} />)
            : (couple
              ? <><Personnage habit={teinte.fg} cheveux={cheveux2} madame={estMadame(conj.civilite)} x={6} s={0.78} /><Personnage habit={teinte.fg} cheveux={cheveux1} madame={estMadame(c.civilite)} x={-4.5} s={0.84} /></>
              : <Personnage habit={teinte.fg} cheveux={cheveux1} madame={estMadame(c.civilite)} />)}
      </svg>
    </span>
  );
}
