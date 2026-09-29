/**
 * L'écran d'ouverture de l'espace acheteur.
 *
 * La page de l'espace lit tout le dossier avant de s'afficher : les biens, les
 * visites, les passages de veille. Ça prend une seconde ou deux, et jusqu'ici
 * le client regardait un écran vide pendant ce temps-là.
 *
 * Next envoie ce fichier tout de suite, puis remplace par la vraie page quand
 * elle est prête. Le fond est exactement celui de l'écran d'ouverture
 * d'Android (background_color du manifeste) : le client ne voit aucune
 * coupure, juste son icône, puis son espace.
 *
 * V3.29 : plus clair, avec le logo de l'agence (public/logos/) et
 * « Chargement en cours… », à la demande d'Alexandre.
 */

const FOND = '#f4f6fa';
const ENCRE = '#1b365d';
const OR = '#c9a84c';

export default function Ouverture() {
  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 100,
        display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center', gap: 26,
        background: `radial-gradient(ellipse at 50% 38%, #ffffff 0%, ${FOND} 62%)`,
        fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
      }}
    >
      <style>{`
        @keyframes emilio-pose {
          from { opacity: 0; transform: translateY(8px) scale(.97) }
          to   { opacity: 1; transform: none }
        }
        @keyframes emilio-file {
          0%   { transform: translateX(-100%) }
          100% { transform: translateX(250%) }
        }
        @media (prefers-reduced-motion: reduce) {
          .emilio-anim { animation: none !important }
        }
      `}</style>

      {/* Le logo de l'agence, en grand : le client sait chez qui il arrive. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/logos/logo-emilio-800.png" alt="Emilio conseil immobilier" width={240} height={101}
        className="emilio-anim"
        style={{ width: 'min(240px, 62vw)', height: 'auto', animation: 'emilio-pose .5s cubic-bezier(.16,1,.3,1) both' }}
      />

      <div className="emilio-anim" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14, animation: 'emilio-pose .5s .12s cubic-bezier(.16,1,.3,1) both' }}>
        <div style={{ fontSize: 15, fontWeight: 600, color: ENCRE, opacity: .78 }}>
          Chargement en cours…
        </div>
        {/* Une fine barre qui file : ça avance, sans promettre de durée. */}
        <div style={{ position: 'relative', width: 150, height: 4, borderRadius: 99, background: 'rgba(27,54,93,.12)', overflow: 'hidden' }}>
          <span className="emilio-anim" style={{
            position: 'absolute', top: 0, bottom: 0, left: 0, width: '40%', borderRadius: 99,
            background: `linear-gradient(90deg, ${ENCRE}, ${OR})`,
            animation: 'emilio-file 1.1s cubic-bezier(.45,0,.35,1) infinite',
          }} />
        </div>
      </div>
    </div>
  );
}
