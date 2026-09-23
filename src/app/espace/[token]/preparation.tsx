/**
 * « Votre espace est en préparation. »
 *
 * Le lien est bon, le client existe — il n'a simplement aucune recherche
 * ouverte en ce moment. Ça arrive entre deux recherches : Alexandre a
 * clôturé la précédente et n'a pas encore ouvert la suivante.
 *
 * Avant, ce client tombait sur « ce lien n'est plus actif », ce qui était
 * faux et inquiétant : son lien marche très bien, et il remarchera tout seul
 * dès qu'une recherche sera ouverte. On lui dit donc la vérité, sans le
 * mettre dans l'embarras — et on lui laisse de quoi appeler s'il trouve
 * que ça traîne.
 *
 * ⚠️ Cet écran ne remplace pas not-found.tsx : celui-là reste pour les liens
 * qui ne mènent vraiment nulle part (fiche supprimée, adresse tronquée).
 */

const ENCRE = '#1a2332';
const OR_CLAIR = '#dcc271';
const OR_FONCE = '#b8923a';

const TEL = '06 58 95 76 32';
const TEL_URL = '+33658957632';
const MAIL = 'arogelet@emilio-immo.com';

export default function EspaceEnPreparation({ prenom }: { prenom?: string | null }) {
  const bonjour = prenom ? `Bonjour ${prenom},` : 'Bonjour,';

  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 100, overflowY: 'auto',
        display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center', gap: 24,
        padding: '40px 24px', background: ENCRE, fontFamily:
          "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
      }}
    >
      <style>{`
        @keyframes emilio-pose {
          from { opacity: 0; transform: translateY(8px) scale(.96) }
          to   { opacity: 1; transform: none }
        }
        @keyframes emilio-pouls {
          0%, 100% { opacity: .35; transform: scale(1) }
          50%      { opacity: 1;   transform: scale(1.35) }
        }
        .lien-acte:active { transform: scale(.97) }
      `}</style>

      {/* La même icône que l'écran d'ouverture : il est au bon endroit, et il
          doit le sentir tout de suite. */}
      <div style={{
        width: 76, height: 76, borderRadius: 19,
        background: `linear-gradient(135deg, ${OR_CLAIR} 0%, ${OR_FONCE} 100%)`,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        boxShadow: '0 18px 40px -18px rgba(0,0,0,.85)',
        animation: 'emilio-pose .5s cubic-bezier(.16,1,.3,1) both',
      }}>
        <svg width={76} height={76} viewBox="0 0 100 100" aria-hidden="true">
          <path d="M50 18c-12.7 0-23 10.3-23 23 0 17.3 23 41 23 41s23-23.7 23-41c0-12.7-10.3-23-23-23z" fill={ENCRE} />
          <path d="M39 44 50 34l11 10v12H39z" fill={OR_CLAIR} />
        </svg>
      </div>

      <div style={{
        textAlign: 'center', maxWidth: 430,
        animation: 'emilio-pose .5s .1s cubic-bezier(.16,1,.3,1) both',
      }}>
        <div style={{
          fontSize: 10, fontWeight: 800, letterSpacing: 2.4,
          textTransform: 'uppercase', color: OR_CLAIR, opacity: .85,
        }}>
          Emilio Immobilier
        </div>

        <h1 style={{
          margin: '14px 0 0', fontSize: 23, fontWeight: 800, color: '#fff',
          letterSpacing: -.3, lineHeight: 1.3,
        }}>
          Votre espace est en préparation
        </h1>

        <p style={{
          margin: '12px 0 0', fontSize: 15, lineHeight: 1.7,
          color: 'rgba(255,255,255,.66)',
        }}>
          {bonjour} aucune recherche n’est ouverte pour le moment. Votre
          conseiller y travaille&nbsp;: dès qu’elle est en place, tout
          réapparaît ici, au même endroit et avec le même lien. Vous n’avez
          rien à réinstaller.
        </p>

        <div style={{
          display: 'inline-flex', alignItems: 'center', gap: 9,
          marginTop: 18, padding: '8px 14px', borderRadius: 99,
          background: 'rgba(255,255,255,.07)', border: '1px solid rgba(255,255,255,.14)',
          fontSize: 12.5, fontWeight: 700, color: 'rgba(255,255,255,.72)',
        }}>
          <span style={{
            width: 7, height: 7, borderRadius: '50%', background: OR_CLAIR,
            animation: 'emilio-pouls 2s ease-in-out infinite',
          }} />
          Revenez d’ici quelques jours
        </div>
      </div>

      {/* Deux gestes, pas trois. S'il trouve que ça traîne, il doit pouvoir le
          dire en un geste plutôt que de chercher un numéro. */}
      <div style={{
        display: 'flex', gap: 10, flexWrap: 'wrap', justifyContent: 'center',
        animation: 'emilio-pose .5s .18s cubic-bezier(.16,1,.3,1) both',
      }}>
        <a className="lien-acte" href={`tel:${TEL_URL}`} style={{
          display: 'inline-flex', alignItems: 'center', gap: 8,
          padding: '13px 22px', borderRadius: 14, textDecoration: 'none',
          background: `linear-gradient(135deg, ${OR_CLAIR} 0%, ${OR_FONCE} 100%)`,
          color: ENCRE, fontSize: 15, fontWeight: 800,
          boxShadow: '0 14px 30px -16px rgba(0,0,0,.9)',
          transition: 'transform .12s ease',
        }}>
          {TEL}
        </a>
        <a className="lien-acte" href={`mailto:${MAIL}`} style={{
          display: 'inline-flex', alignItems: 'center', gap: 8,
          padding: '13px 22px', borderRadius: 14, textDecoration: 'none',
          background: 'rgba(255,255,255,.08)',
          border: '1px solid rgba(255,255,255,.16)',
          color: 'rgba(255,255,255,.9)', fontSize: 15, fontWeight: 700,
          transition: 'transform .12s ease',
        }}>
          Écrire un message
        </a>
      </div>

      <div style={{
        fontSize: 12, color: 'rgba(255,255,255,.34)', textAlign: 'center',
        animation: 'emilio-pose .5s .26s cubic-bezier(.16,1,.3,1) both',
      }}>
        Alexandre Rogelet · Paris et Hauts-de-Seine
      </div>
    </div>
  );
}
