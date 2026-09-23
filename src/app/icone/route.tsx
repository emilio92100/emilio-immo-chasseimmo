import { ImageResponse } from 'next/og';

/**
 * L'icône de l'espace acheteur, celle qui se pose sur l'écran d'accueil du
 * client : l'épingle de carte, avec un toit à l'intérieur, sur fond or.
 *
 * Le fond clair est un choix : au milieu de quarante applications, une icône
 * sombre de plus se perd. Celle-là se repère du premier coup d'œil.
 *
 * Trois tailles, une seule route :
 *   /icone?t=180   l'iPhone (apple-touch-icon)
 *   /icone?t=192   Android, dans la liste des applications
 *   /icone?t=512   Android, l'écran d'ouverture
 *
 * Elle est dessinée ici plutôt que rangée dans public/ pour une raison simple :
 * un fichier PNG ne se relit pas. Le dessin est écrit en clair juste en dessous,
 * et le changer se fait ici, en un endroit.
 *
 * ⚠️ Ce chemin est volontairement hors du portail d'accès (voir le matcher de
 * src/proxy.ts) : une icône doit rester publique, sinon le téléphone reçoit la
 * page de connexion à la place de l'image, et l'écran d'accueil affiche un
 * carré gris.
 */

const OR_CLAIR = '#dcc271';
const OR_FONCE = '#b8923a';
const ENCRE = '#1a2332';

const TAILLES = [96, 180, 192, 512];

/**
 * La version « silhouette », pour la barre d'état d'Android : /icone?mono=1
 *
 * Android ne dessine pas cette petite icône-là. Il n'en garde que la forme —
 * il jette les couleurs et remplit ce qui n'est pas transparent. Lui donner
 * l'icône normale, un carré doré plein, donne donc un carré blanc : c'est
 * toute la forme qui est pleine.
 *
 * D'où cette variante : aucun fond, seulement la forme.
 *
 * C'est une maison, et pas l'épingle de l'icône principale : à dix-sept
 * pixels de haut, une épingle se lit « localisation ». Une maison se lit
 * « logement », et c'est large et plein — donc visible du premier coup d'œil
 * au milieu des autres pictogrammes de la barre.
 */
function silhouette(): string {
  /* Un seul tracé, avec la porte en « trou » (fill-rule evenodd) : c'est elle
     qui empêche la forme de se lire comme un simple triangle sur un carré. */
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
  <path fill="#ffffff" fill-rule="evenodd"
    d="M50 10 4 54h16v36h60V54h16z
       M41 62h18v28H41z"/>
</svg>`;
}

/* Tout tient dans un carré de 100 × 100, puis on met à l'échelle. L'épingle va
   de 18 à 82 en hauteur et de 27 à 73 en largeur : elle reste entièrement dans
   le disque central qu'Android découpe (« maskable »), donc rien n'est rogné. */
function dessin(): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
  <defs>
    <linearGradient id="or" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="${OR_CLAIR}"/>
      <stop offset="1" stop-color="${OR_FONCE}"/>
    </linearGradient>
  </defs>
  <rect width="100" height="100" fill="url(#or)"/>
  <path d="M50 18c-12.7 0-23 10.3-23 23 0 17.3 23 41 23 41s23-23.7 23-41c0-12.7-10.3-23-23-23z" fill="${ENCRE}"/>
  <path d="M39 44 50 34l11 10v12H39z" fill="${OR_CLAIR}"/>
</svg>`;
}

export function GET(requete: Request) {
  const params = new URL(requete.url).searchParams;
  const demandee = Number(params.get('t'));
  const mono = params.get('mono') === '1';
  const t = TAILLES.includes(demandee) ? demandee : (mono ? 96 : 512);

  /* Le dessin passe par une image plutôt que par des balises SVG directes :
     c'est la seule forme que le convertisseur en PNG rend à l'identique. */
  const source = `data:image/svg+xml;base64,${Buffer.from(mono ? silhouette() : dessin()).toString('base64')}`;

  return new ImageResponse(
    (
      <div style={{ width: t, height: t, display: 'flex' }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={source} width={t} height={t} alt="" />
      </div>
    ),
    { width: t, height: t },
  );
}
