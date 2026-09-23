/**
 * Le lien ne mène plus à rien.
 *
 * Trois cas arrivent ici, et le client ne fait pas la différence entre eux :
 *   — sa fiche a été supprimée du CRM (le lien vivait avec elle) ;
 *   — toutes ses recherches ont été masquées (`espace_actif = false`) ;
 *   — le lien a été mal recopié, ou coupé par une messagerie.
 *
 * ⚠️ Supprimer UNE recherche ne mène plus ici : le lien appartient au client
 * (voir src/lib/espace.ts), pas à la recherche. Le client bascule simplement
 * sur celle qui reste, et si c'était la dernière, son espace se rouvre tout
 * seul le jour où on lui en ouvre une nouvelle.
 *
 * Jusqu'ici il tombait sur la page 404 de Next : un fond blanc et « This page
 * could not be found ». Pour quelqu'un qui a posé cet espace sur son écran
 * d'accueil et qui l'ouvre trois semaines plus tard, c'est brutal et ça n'aide
 * personne — il ne sait ni ce qui s'est passé, ni qui appeler.
 *
 * On ne dit pas laquelle des trois raisons c'est : le serveur ne peut pas le
 * savoir. Quand la fiche est supprimée, sa ligne n'existe plus, donc son jeton
 * non plus — il ne reste rien à interroger. On reste donc factuel, et on donne
 * ce qui sert vraiment : de quoi joindre son conseiller.
 */

const ENCRE = '#1a2332';
const OR_CLAIR = '#dcc271';
const OR_FONCE = '#b8923a';

const TEL = '06 58 95 76 32';
const TEL_URL = '+33658957632';
const MAIL = 'arogelet@emilio-immo.com';

export default function LienInactif() {
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
        .lien-acte:active { transform: scale(.97) }
      `}</style>

      {/* La même icône que l'écran d'ouverture : il reconnaît l'endroit, même
          si ce qu'il y trouve n'est pas ce qu'il venait chercher. */}
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
        textAlign: 'center', maxWidth: 420,
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
          Ce lien n’est plus actif
        </h1>

        <p style={{
          margin: '12px 0 0', fontSize: 15, lineHeight: 1.7,
          color: 'rgba(255,255,255,.66)',
        }}>
          Votre espace a été clôturé, ou l’adresse a été recopiée en partie.
          Si vous pensez qu’il s’agit d’une erreur, votre conseiller vous
          rouvre un accès en deux minutes.
        </p>
      </div>

      {/* Deux gestes, pas trois : appeler ou écrire. Un client devant une page
          close n'a pas envie de chercher comment joindre quelqu'un. */}
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
