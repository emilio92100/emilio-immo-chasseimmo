'use client';
import { useState, useEffect, useRef } from 'react';

export default function BookmarkletPage() {
  const [origin, setOrigin] = useState('');
  const [copied, setCopied] = useState(false);
  const linkRef = useRef<HTMLAnchorElement>(null);

  useEffect(() => {
    setOrigin(window.location.origin);
  }, []);

  // ─── BOOKMARKLET v3 ───────────────────────────────────────────────────
  // Au lieu d'envoyer le HTML immédiatement (timing fragile), on stocke
  // une référence et on attend que la page de capture nous le demande.
  // C'est elle qui décide quand elle est prête.
  const bookmarkletCode = origin
    ? `javascript:(function(){var APP='${origin}';var H=document.documentElement.outerHTML;var U=window.location.href;var T=document.title;window.__EMILIO_DATA__={html:H,url:U,title:T};window.addEventListener('message',function(e){if(e.origin!==APP)return;if(e.data&&e.data.type==='EMILIO_READY'&&e.source){e.source.postMessage({type:'EMILIO_HTML',html:H,url:U,title:T},APP);}});var w=window.open(APP+'/bookmarklet/capture','emilio_capture','width=900,height=700');if(!w){alert('⚠️ Popup bloquée ! Autorise les popups pour ce site puis réessaie.');}})();`
    : '';

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

        {/* IMPORTANT — Remplacer l'ancien bookmarklet */}
        <div style={{ background: '#fef3c7', border: '1px solid #fcd34d', borderRadius: 14, padding: 18, marginBottom: 24, fontSize: 14, color: '#78350f' }}>
          <strong>⚠️ Mise à jour :</strong> si tu avais déjà installé l&apos;ancien favori, supprime-le d&apos;abord puis installe celui-ci (le code a été amélioré).
        </div>

        {/* Étape 1 */}
        <div style={{ background: 'white', borderRadius: 14, border: '1px solid #e3e8f0', padding: 24, marginBottom: 16 }}>
          <div style={{ fontWeight: 800, fontSize: 14, color: '#c9a84c', marginBottom: 12, textTransform: 'uppercase', letterSpacing: 1 }}>Étape 1</div>
          <div style={{ fontSize: 16, color: '#1a2332', marginBottom: 16 }}>
            Affiche ta barre de favoris dans Chrome avec <kbd style={kbdStyle}>Ctrl</kbd> + <kbd style={kbdStyle}>Shift</kbd> + <kbd style={kbdStyle}>B</kbd>
          </div>
        </div>

        {/* MÉTHODE GARANTIE EN PREMIER */}
        <div style={{ background: '#ecfdf5', border: '2px solid #10b981', borderRadius: 14, padding: 24, marginBottom: 16 }}>
          <div style={{ fontWeight: 800, fontSize: 14, color: '#065f46', marginBottom: 12, textTransform: 'uppercase', letterSpacing: 1 }}>
            ✅ Méthode recommandée (la plus simple)
          </div>

          <div style={{ fontSize: 15, color: '#1a2332', lineHeight: 1.9, marginBottom: 14 }}>
            <strong>1.</strong> Clique pour copier le code :
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
              marginBottom: 18,
            }}
          >
            {copied ? '✓ Code copié dans le presse-papiers !' : '📋 Copier le code du bookmarklet'}
          </button>

          <div style={{ fontSize: 15, color: '#1a2332', lineHeight: 2 }}>
            <div><strong>2.</strong> Appuie sur <kbd style={kbdStyle}>Ctrl</kbd> + <kbd style={kbdStyle}>D</kbd> sur cette page</div>
            <div><strong>3.</strong> Une fenêtre &laquo;&nbsp;Ajouter un favori&nbsp;&raquo; s&apos;ouvre</div>
            <div><strong>4.</strong> Change le <strong>nom</strong> en : <code style={codeStyle}>📥 Envoyer à Emilio</code></div>
            <div><strong>5.</strong> Clique sur <strong>&laquo;&nbsp;Plus&nbsp;&raquo;</strong> en bas de la fenêtre (pour voir l&apos;URL)</div>
            <div><strong>6.</strong> Efface l&apos;URL et <strong>colle</strong> (<kbd style={kbdStyle}>Ctrl</kbd> + <kbd style={kbdStyle}>V</kbd>) le code copié</div>
            <div><strong>7.</strong> Choisis <strong>&laquo;&nbsp;Barre de favoris&nbsp;&raquo;</strong> comme emplacement</div>
            <div><strong>8.</strong> <strong>Enregistrer</strong> ✅</div>
          </div>
        </div>

        {/* Méthode glissée (alternative) */}
        <div style={{ background: 'white', borderRadius: 14, border: '1px solid #e3e8f0', padding: 24, marginBottom: 16 }}>
          <div style={{ fontWeight: 800, fontSize: 14, color: '#64748b', marginBottom: 12, textTransform: 'uppercase', letterSpacing: 1 }}>Méthode alternative — Glisser</div>
          <div style={{ fontSize: 14, color: '#64748b', marginBottom: 16 }}>
            Si tu préfères, tu peux essayer de glisser ce bouton :
          </div>
          <div style={{ display: 'flex', justifyContent: 'center', padding: '12px 0' }}>
            <a
              ref={linkRef}
              href="#"
              onClick={(e) => {
                e.preventDefault();
                alert('⚠️ Ne clique pas — glisse-le dans ta barre de favoris !\n\nOu utilise la méthode recommandée ci-dessus.');
              }}
              draggable
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 8,
                padding: '12px 22px',
                background: '#1a2332',
                color: '#c9a84c',
                borderRadius: 12,
                fontWeight: 800,
                fontSize: 15,
                textDecoration: 'none',
                cursor: 'grab',
                userSelect: 'none',
                fontFamily: "'Plus Jakarta Sans', sans-serif",
              }}
            >
              📥 Envoyer à Emilio
            </a>
          </div>
        </div>

        {/* Étape 3 — Utilisation */}
        <div style={{ background: 'white', borderRadius: 14, border: '1px solid #e3e8f0', padding: 24, marginBottom: 16 }}>
          <div style={{ fontWeight: 800, fontSize: 14, color: '#c9a84c', marginBottom: 12, textTransform: 'uppercase', letterSpacing: 1 }}>Comment l&apos;utiliser ensuite</div>
          <ol style={{ fontSize: 15, color: '#1a2332', lineHeight: 1.8, paddingLeft: 20 }}>
            <li>Va sur une annonce (SeLoger, LeBonCoin, Bien&apos;ici...)</li>
            <li>Scroll rapidement jusqu&apos;en bas pour charger les photos</li>
            <li>Clique sur le favori <strong>📥 Envoyer à Emilio</strong></li>
            <li>Une fenêtre s&apos;ouvre, choisis le client, valide ✅</li>
          </ol>
        </div>

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
