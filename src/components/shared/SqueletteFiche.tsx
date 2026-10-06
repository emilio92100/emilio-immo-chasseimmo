'use client';

/* ═══ La silhouette d'une fiche, le temps de la lire (V3.80) ═══════════════
   Alexandre : « quand on clique sur le bien ou la cliente, il faut que
   l'apparition se fasse jolie ». Avant : « Chargement de la fiche… » en gris,
   puis la fiche entière d'un coup. Maintenant : le bandeau, la barre des
   rubriques et deux cartes qui miroitent (classes .sq-* de globals.css),
   puis la fiche arrive en fondu (.fiche-entre). */
export default function SqueletteFiche({ label = 'Chargement de la fiche' }: { label?: string }) {
  return (
    <div className="sq-fiche" aria-busy="true" aria-label={label}>
      <div className="sq-fiche-bandeau">
        <span className="sq-rond sq-fiche-av" />
        <span className="sq-txt">
          <span className="sq-barre sq-fiche-clair" style={{ width: '34%', height: 16 }} />
          <span className="sq-barre sq-fine sq-fiche-clair" style={{ width: '52%' }} />
          <span className="sq-barre sq-fine sq-fiche-clair" style={{ width: '22%' }} />
        </span>
      </div>
      <div className="sq-fiche-onglets">
        {[64, 82, 58, 90, 70].map((w, i) => <span key={i} className="sq-barre" style={{ width: w, height: 12 }} />)}
      </div>
      <div className="sq-fiche-cartes">
        {[0, 1].map(i => (
          <div key={i} className="sq-carte" style={{ animationDelay: `${120 + i * 70}ms` }}>
            <span className="sq-txt">
              <span className="sq-barre" style={{ width: '40%' }} />
              <span className="sq-barre sq-fine" style={{ width: '82%' }} />
              <span className="sq-barre sq-fine" style={{ width: '64%' }} />
              <span className="sq-barre sq-fine" style={{ width: '48%' }} />
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
