'use client';

import { useState, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';

function FormulaireAcces() {
  const router = useRouter();
  const params = useSearchParams();
  const suite = params.get('suite') || '/';
  const erreurConfig = params.get('erreur') === 'config';

  const [code, setCode] = useState('');
  const [erreur, setErreur] = useState('');
  const [envoi, setEnvoi] = useState(false);

  async function valider(e: React.FormEvent) {
    e.preventDefault();
    if (!code.trim() || envoi) return;
    setEnvoi(true);
    setErreur('');
    try {
      const res = await fetch('/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code }),
      });
      const data = await res.json();
      if (data.ok) {
        router.replace(suite);
        router.refresh();
      } else {
        setErreur(data.error || 'Code incorrect.');
        setCode('');
      }
    } catch {
      setErreur('Erreur réseau. Réessayez.');
    }
    setEnvoi(false);
  }

  return (
    <div
      style={{
        minHeight: '100vh',
        background: '#1a2332',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 24,
        fontFamily: "'Plus Jakarta Sans', system-ui, sans-serif",
      }}
    >
      <div style={{ width: '100%', maxWidth: 380 }}>
        <div style={{ textAlign: 'center', marginBottom: 30 }}>
          <div
            style={{
              fontSize: 27,
              fontWeight: 800,
              color: '#ffffff',
              letterSpacing: -0.5,
              marginBottom: 6,
            }}
          >
            Emilio Immobilier
          </div>
          <div
            style={{
              fontSize: 12,
              fontWeight: 700,
              color: '#c9a84c',
              textTransform: 'uppercase',
              letterSpacing: 2,
            }}
          >
            Chasse Immo
          </div>
        </div>

        <form
          onSubmit={valider}
          style={{
            background: '#ffffff',
            borderRadius: 18,
            padding: '28px 26px',
            boxShadow: '0 20px 50px rgba(0,0,0,0.3)',
          }}
        >
          <label
            htmlFor="code"
            style={{
              display: 'block',
              fontSize: 11,
              fontWeight: 800,
              color: '#94a3b8',
              textTransform: 'uppercase',
              letterSpacing: 0.9,
              marginBottom: 8,
            }}
          >
            Code d&apos;accès
          </label>

          <input
            id="code"
            type="password"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            autoFocus
            autoComplete="current-password"
            placeholder="••••••••"
            style={{
              width: '100%',
              boxSizing: 'border-box',
              border: '1px solid #e3e8f0',
              borderRadius: 11,
              padding: '13px 15px',
              fontSize: 17,
              letterSpacing: 3,
              color: '#1a2332',
              fontFamily: 'inherit',
              outline: 'none',
              background: '#f8fafc',
            }}
          />

          {erreur && (
            <div
              style={{
                marginTop: 12,
                background: '#fef2f2',
                border: '1px solid #fecaca',
                borderRadius: 10,
                padding: '9px 13px',
                fontSize: 13,
                color: '#b91c1c',
                fontWeight: 600,
              }}
            >
              {erreur}
            </div>
          )}

          {erreurConfig && !erreur && (
            <div
              style={{
                marginTop: 12,
                background: '#fffbeb',
                border: '1px solid #fde68a',
                borderRadius: 10,
                padding: '9px 13px',
                fontSize: 13,
                color: '#92400e',
                fontWeight: 600,
              }}
            >
              La variable EMILIO_ACCESS_CODE n&apos;est pas définie sur le serveur.
            </div>
          )}

          <button
            type="submit"
            disabled={envoi || !code.trim()}
            style={{
              width: '100%',
              marginTop: 16,
              background: envoi || !code.trim() ? '#d8c89a' : '#c9a84c',
              color: '#ffffff',
              border: 'none',
              borderRadius: 11,
              padding: '13px 0',
              fontSize: 14,
              fontWeight: 700,
              cursor: envoi || !code.trim() ? 'default' : 'pointer',
              fontFamily: 'inherit',
            }}
          >
            {envoi ? 'Vérification…' : 'Entrer'}
          </button>
        </form>

        <div
          style={{
            textAlign: 'center',
            marginTop: 18,
            fontSize: 12,
            color: 'rgba(255,255,255,0.35)',
          }}
        >
          Accès réservé — RT Conseils · CPI 9201 2020 000 045 344
        </div>
      </div>
    </div>
  );
}

export default function PageLogin() {
  return (
    <Suspense fallback={<div style={{ minHeight: '100vh', background: '#1a2332' }} />}>
      <FormulaireAcces />
    </Suspense>
  );
}
