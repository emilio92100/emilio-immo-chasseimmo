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
 */

const ENCRE = '#1a2332';
const OR_CLAIR = '#dcc271';
const OR_FONCE = '#b8923a';

export default function Ouverture() {
  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 100,
        display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center', gap: 22,
        background: ENCRE, fontFamily:
          "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
      }}
    >
      <style>{`
        @keyframes emilio-tourne { to { transform: rotate(360deg) } }
        @keyframes emilio-pose {
          from { opacity: 0; transform: translateY(8px) scale(.96) }
          to   { opacity: 1; transform: none }
        }
      `}</style>

      {/* La même icône que sur l'écran d'accueil, au même format : le client
          reconnaît ce sur quoi il vient d'appuyer. */}
      <div style={{
        width: 88, height: 88, borderRadius: 22,
        background: `linear-gradient(135deg, ${OR_CLAIR} 0%, ${OR_FONCE} 100%)`,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        boxShadow: '0 18px 40px -18px rgba(0,0,0,.85)',
        animation: 'emilio-pose .5s cubic-bezier(.16,1,.3,1) both',
      }}>
        <svg width={88} height={88} viewBox="0 0 100 100" aria-hidden="true">
          <path d="M50 18c-12.7 0-23 10.3-23 23 0 17.3 23 41 23 41s23-23.7 23-41c0-12.7-10.3-23-23-23z" fill={ENCRE} />
          <path d="M39 44 50 34l11 10v12H39z" fill={OR_CLAIR} />
        </svg>
      </div>

      <div style={{ textAlign: 'center', animation: 'emilio-pose .5s .1s cubic-bezier(.16,1,.3,1) both' }}>
        <div style={{
          fontSize: 10, fontWeight: 800, letterSpacing: 2.4,
          textTransform: 'uppercase', color: OR_CLAIR, opacity: .85,
        }}>
          Emilio Immobilier
        </div>
        <div style={{ marginTop: 8, fontSize: 15, fontWeight: 600, color: 'rgba(255,255,255,.72)' }}>
          Ouverture de votre espace…
        </div>
      </div>

      <div style={{
        width: 26, height: 26, borderRadius: '50%',
        border: '2.5px solid rgba(255,255,255,.14)', borderTopColor: OR_CLAIR,
        animation: 'emilio-tourne .75s linear infinite',
      }} />
    </div>
  );
}
