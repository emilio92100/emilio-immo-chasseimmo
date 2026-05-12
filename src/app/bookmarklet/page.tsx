'use client';
import { useState, useEffect, useRef } from 'react';

export default function BookmarkletPage() {
  const [origin, setOrigin] = useState('');
  const [copied, setCopied] = useState(false);
  const linkRef = useRef<HTMLAnchorElement>(null);

  useEffect(() => {
    setOrigin(window.location.origin);
  }, []);

  // Code JS du bookmarklet
  const bookmarkletCode = origin
    ? `javascript:(function(){var APP='${origin}';var h=document.documentElement.outerHTML;var u=window.location.href;var t=document.title;var w=window.open(APP+'/bookmarklet/capture?url='+encodeURIComponent(u)+'&title='+encodeURIComponent(t),'_blank','width=900,height=700');setTimeout(function(){if(w&&!w.closed){w.postMessage({type:'EMILIO_HTML',html:h,url:u,title:t},APP);}},1500);})();`
    : '';

  // CONTOURNEMENT : on définit le href en JavaScript après le rendu
  // pour éviter le blocage de React sur les javascript: URLs
  useEffect(() => {
    if (linkRef.current && bookmarkletCode) {
      linkRef.current.setAttribute('href', bookmarkletCode);
    }
  }, [bookmarkletCode]);

  function copyCode() {
    navigator.clipboard.writeText(bookmarkletCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div style={{ minHeight: '100vh', background: '#f8fafc', padding: '40px 20px', fontFamily: "'DM Sans', sans-serif" }}>
      <div style={{ maxWidth: 720, margin: '0 auto' }}>
        <h1 style={{ fontFamily: "'Plus Jakarta Sans', sans-serif", fontWeight: 800, fontSize: 28, color: '#1a2332', marginBottom: 8 }}>
          📥 Installation du bouton Emilio
        </h1>
        <p style={{ color: '#64748b', fontSize: 15, marginBottom: 30 }}>
          Un clic pour ajouter un bien à une fiche client depuis n&apos;importe quelle annonce.
        </p>

        {/* Étape 1 */}
        <div style={{ background: 'white', borderRadius: 14, border: '1px solid #e3e8f0', padding: 24, marginBottom: 16 }}>
          <div style={{ fontWeight: 800, fontSize: 14, color: '#c9a84c', marginBottom: 12, textTransform: 'uppercase', letterSpacing: 1 }}>Étape 1</div>
          <div style={{ fontSize: 16, color: '#1a2332', marginBottom: 16 }}>
            Affiche ta barre de favoris dans Chrome avec <kbd style={kbdStyle}>Ctrl</kbd> + <kbd style={kbdStyle}>Shift</kbd> + <kbd style={kbdStyle}>B</kbd>
          </div>
        </div>

        {/* Étape 2 */}
        <div style={{ background: 'white', borderRadius: 14, border: '1px solid #e3e8f0', padding: 24, marginBottom: 16 }}>
          <div style={{ fontWeight: 800, fontSize: 14, color: '#c9a84c', marginBottom: 12, textTransform: 'uppercase', letterSpacing: 1 }}>Étape 2 — Glisser le bouton</div>
          <div style={{ fontSize: 16, color: '#1a2332', marginBottom: 16 }}>
            Fais <strong>glisser le bouton ci-dessous</strong> dans ta barre de favoris :
          </div>
          <div style={{ display: 'flex', justifyContent: 'center', padding: '20px 0' }}>
            {/* Le href est défini dynamiquement par useEffect pour bypasser React */}
            <a
              ref={linkRef}
              href="#"
              onClick={(e) => {
                e.preventDefault();
                alert('⚠️ Ne clique pas — glisse-le dans ta barre de favoris en haut !\n\nOu fais clic-droit dessus → "Ajouter cette page aux favoris"');
              }}
              draggable
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 8,
                padding: '14px 28px',
                background: '#1a2332',
                color: '#c9a84c',
                borderRadius: 12,
                fontWeight: 800,
                fontSize: 17,
                textDecoration: 'none',
                cursor: 'grab',
                userSelect: 'none',
                boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
                fontFamily: "'Plus Jakarta Sans', sans-serif",
              }}
            >
              📥 Envoyer à Emilio
            </a>
          </div>
          <div style={{ fontSize: 13, color: '#94a3b8', textAlign: 'center', marginTop: 8 }}>
            👆 Maintiens le clic gauche et fais-le glisser jusqu&apos;à ta barre de favoris en haut
          </div>
        </div>

        {/* MÉTHODE ALTERNATIVE RECOMMANDÉE */}
        <div style={{ background: '#ecfdf5', border: '1px solid #a7f3d0', borderRadius: 14, padding: 24, marginBottom: 16 }}>
          <div style={{ fontWeight: 800, fontSize: 14, color: '#065f46', marginBottom: 12, textTransform: 'uppercase', letterSpacing: 1 }}>
            ✅ Méthode garantie (si le glissé ne marche pas)
          </div>
          <div style={{ fontSize: 15, color: '#1a2332', lineHeight: 1.7, marginBottom: 14 }}>
            <strong>1.</strong> Clique sur le bouton pour copier le code :
          </div>

          <button
            onClick={copyCode}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 8,
              padding: '12px 22px',
              background: copied ? '#10b981' : '#1a2332',
              color: 'white',
              borderRadius: 10,
              fontWeight: 700,
              fontSize: 14,
              border: 'none',
              cursor: 'pointer',
              fontFamily: "'DM Sans', sans-serif",
              marginBottom: 16,
            }}
          >
            {copied ? '✓ Code copié !' : '📋 Copier le code du bookmarklet'}
          </button>

          <div style={{ fontSize: 15, color: '#1a2332', lineHeight: 1.9 }}>
            <div><strong>2.</strong> Fais <strong>Ctrl + D</strong> sur cette page (ça ouvre la fenêtre &laquo;&nbsp;Ajouter un favori&nbsp;&raquo;)</div>
            <div><strong>3.</strong> Dans la fenêtre, change le <strong>nom</strong> en : <code style={codeStyle}>📥 Envoyer à Emilio</code></div>
            <div><strong>4.</strong> Clique sur <strong>&laquo;&nbsp;Plus&nbsp;&raquo;</strong> pour voir le champ &laquo;&nbsp;URL&nbsp;&raquo;</div>
            <div><strong>5.</strong> Efface l&apos;URL et <strong>colle</strong> (Ctrl+V) le code copié</div>
            <div><strong>6.</strong> Choisis &laquo;&nbsp;<strong>Barre de favoris</strong>&nbsp;&raquo; comme dossier</div>
            <div><strong>7.</strong> Clique sur <strong>&laquo;&nbsp;Enregistrer&nbsp;&raquo;</strong></div>
          </div>
        </div>

        {/* Étape 3 — Utilisation */}
        <div style={{ background: 'white', borderRadius: 14, border: '1px solid #e3e8f0', padding: 24, marginBottom: 16 }}>
          <div style={{ fontWeight: 800, fontSize: 14, color: '#c9a84c', marginBottom: 12, textTransform: 'uppercase', letterSpacing: 1 }}>Étape 3 — Utilisation</div>
          <ol style={{ fontSize: 15, color: '#1a2332', lineHeight: 1.8, paddingLeft: 20 }}>
            <li>Va sur une annonce (SeLoger, LeBonCoin, Bien&apos;ici...)</li>
            <li>Scroll rapidement jusqu&apos;en bas pour charger les photos</li>
            <li>Clique sur le favori <strong>📥 Envoyer à Emilio</strong></li>
            <li>Une fenêtre s&apos;ouvre : choisis le client et confirme</li>
          </ol>
        </div>

        {/* Code brut visible */}
        <details style={{ marginTop: 20 }}>
          <summary style={{ cursor: 'pointer', color: '#64748b', fontSize: 13 }}>Voir le code brut du bookmarklet</summary>
          <textarea
            readOnly
            value={bookmarkletCode}
            style={{
              width: '100%',
              marginTop: 10,
              padding: 10,
              fontSize: 11,
              fontFamily: 'monospace',
              background: 'white',
              border: '1px solid #e3e8f0',
              borderRadius: 8,
              resize: 'vertical',
              minHeight: 80,
            }}
            onClick={(e) => (e.target as HTMLTextAreaElement).select()}
          />
        </details>
      </div>
    </div>
  );
}

const kbdStyle: React.CSSProperties = {
  display: 'inline-block',
  padding: '2px 8px',
  background: '#1a2332',
  color: 'white',
  borderRadius: 4,
  fontSize: 12,
  fontFamily: 'monospace',
  fontWeight: 600,
};

const codeStyle: React.CSSProperties = {
  background: 'white',
  padding: '2px 8px',
  borderRadius: 4,
  border: '1px solid #a7f3d0',
  fontSize: 13,
  fontFamily: 'monospace',
};
