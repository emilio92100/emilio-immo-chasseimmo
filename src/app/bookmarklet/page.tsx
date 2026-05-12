'use client';
import { useState, useEffect } from 'react';

export default function BookmarkletPage() {
  const [origin, setOrigin] = useState('');

  useEffect(() => {
    setOrigin(window.location.origin);
  }, []);

  // Le code JS du bookmarklet, minifié sur une ligne
  // Il récupère le HTML de la page courante et l'envoie à notre API
  const bookmarkletCode = origin
    ? `javascript:(function(){var APP='${origin}';var h=document.documentElement.outerHTML;var u=window.location.href;var t=document.title;var w=window.open(APP+'/bookmarklet/capture?url='+encodeURIComponent(u)+'&title='+encodeURIComponent(t),'_blank','width=900,height=700');setTimeout(function(){if(w&&!w.closed){w.postMessage({type:'EMILIO_HTML',html:h,url:u,title:t},APP);}},1500);})();`
    : '';

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
          <div style={{ fontWeight: 800, fontSize: 14, color: '#c9a84c', marginBottom: 12, textTransform: 'uppercase', letterSpacing: 1 }}>Étape 2</div>
          <div style={{ fontSize: 16, color: '#1a2332', marginBottom: 16 }}>
            Fais <strong>glisser ce bouton</strong> dans ta barre de favoris :
          </div>
          <div style={{ display: 'flex', justifyContent: 'center', padding: '20px 0' }}>
            <a
              href={bookmarkletCode}
              onClick={(e) => { e.preventDefault(); alert('⚠️ Ne clique pas dessus — glisse-le dans ta barre de favoris !'); }}
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
            👆 Maintiens le clic et fais-le glisser jusqu&apos;à ta barre de favoris en haut
          </div>
        </div>

        {/* Étape 3 */}
        <div style={{ background: 'white', borderRadius: 14, border: '1px solid #e3e8f0', padding: 24, marginBottom: 16 }}>
          <div style={{ fontWeight: 800, fontSize: 14, color: '#c9a84c', marginBottom: 12, textTransform: 'uppercase', letterSpacing: 1 }}>Étape 3 — Utilisation</div>
          <ol style={{ fontSize: 15, color: '#1a2332', lineHeight: 1.8, paddingLeft: 20 }}>
            <li>Va sur une annonce (SeLoger, LeBonCoin, Bien&apos;ici...)</li>
            <li>Scroll rapidement jusqu&apos;en bas pour que toutes les photos se chargent</li>
            <li>Si tu veux le téléphone agence, clique sur &laquo;&nbsp;Afficher le numéro&nbsp;&raquo;</li>
            <li>Clique sur le favori <strong>📥 Envoyer à Emilio</strong></li>
            <li>Une fenêtre s&apos;ouvre : choisis le client et confirme</li>
          </ol>
        </div>

        {/* Note alternative */}
        <div style={{ background: '#fef9c3', border: '1px solid #fde68a', borderRadius: 14, padding: 18, marginTop: 24, fontSize: 13, color: '#854d0e' }}>
          <strong>💡 Astuce :</strong> Si le bouton ne se glisse pas, fais clic droit dessus → &laquo;&nbsp;Ajouter aux favoris&nbsp;&raquo;. Ou copie ce code et colle-le manuellement comme URL d&apos;un nouveau favori&nbsp;:
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
              border: '1px solid #fde68a',
              borderRadius: 8,
              resize: 'vertical',
              minHeight: 60,
            }}
            onClick={(e) => (e.target as HTMLTextAreaElement).select()}
          />
        </div>
      </div>
    </div>
  );
}

const kbdStyle = {
  display: 'inline-block',
  padding: '2px 8px',
  background: '#1a2332',
  color: 'white',
  borderRadius: 4,
  fontSize: 12,
  fontFamily: 'monospace',
  fontWeight: 600,
};
