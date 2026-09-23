'use client';

import { useState, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { supabase } from '@/lib/supabase';

/**
 * La porte du CRM.
 *
 * ⚠️ Ce n'est plus un code d'accès : c'est un vrai compte Supabase.
 *
 * Avant, le code était vérifié par le site, et la base n'était jamais au
 * courant de rien — elle voyait arriver des demandes sans savoir si elles
 * venaient d'Alexandre ou d'un inconnu. C'est ce qui obligeait à laisser
 * toutes les tables ouvertes à la clé publique (RLS désactivé), donc lisibles
 * et effaçables par n'importe qui sachant ouvrir la console d'un navigateur.
 *
 * Maintenant, la connexion se fait auprès de Supabase lui-même. La base
 * délivre un jeton personnel, et toutes les lectures du CRM le portent : les
 * règles RLS peuvent enfin distinguer « Alexandre » de « n'importe qui ».
 *
 * Deux serrures se referment donc ici, dans cet ordre :
 *   1. Supabase vérifie le mot de passe et ouvre la session côté base ;
 *   2. /api/login vérifie ce jeton côté serveur et pose le cookie que
 *      src/proxy.ts attend pour servir les pages du CRM.
 *
 * Le cookie seul ne donne accès à aucune donnée : sans la session Supabase,
 * les écrans s'afficheraient vides. Les deux vont ensemble.
 */

function FormulaireAcces() {
  const router = useRouter();
  const params = useSearchParams();
  const suite = params.get('suite') || '/';
  const erreurConfig = params.get('erreur') === 'config';

  const [mail, setMail] = useState('');
  const [motDePasse, setMotDePasse] = useState('');
  const [erreur, setErreur] = useState('');
  const [envoi, setEnvoi] = useState(false);

  const pret = mail.trim().includes('@') && motDePasse.length > 0;

  async function valider(e: React.FormEvent) {
    e.preventDefault();
    if (!pret || envoi) return;
    setEnvoi(true);
    setErreur('');

    try {
      /* ── 1. la session Supabase ── */
      const { data, error } = await supabase.auth.signInWithPassword({
        email: mail.trim(),
        password: motDePasse,
      });

      if (error || !data?.session) {
        /* Le message de Supabase est en anglais et parle de « credentials » :
           on le traduit, sans dire lequel des deux champs est faux. */
        setErreur(
          /invalid login/i.test(error?.message || '')
            ? 'Adresse ou mot de passe incorrect.'
            : (error?.message || 'Connexion impossible.'),
        );
        setMotDePasse('');
        setEnvoi(false);
        return;
      }

      /* ── 2. le cookie qui ouvre les pages ──
         Le serveur revérifie le jeton auprès de Supabase avant de le poser :
         on ne lui fait pas confiance sur parole. */
      const res = await fetch('/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: data.session.access_token }),
      });
      const reponse = await res.json();

      if (!reponse?.ok) {
        /* La session Supabase est ouverte mais la porte reste fermée : on la
           referme, sinon on laisserait une demi-connexion derrière nous. */
        await supabase.auth.signOut();
        setErreur(reponse?.error || 'Connexion refusée par le serveur.');
        setMotDePasse('');
        setEnvoi(false);
        return;
      }

      router.replace(suite);
      router.refresh();
    } catch {
      setErreur('Erreur réseau. Réessayez.');
      setEnvoi(false);
    }
  }

  const champ: React.CSSProperties = {
    width: '100%',
    boxSizing: 'border-box',
    border: '1px solid #e3e8f0',
    borderRadius: 11,
    padding: '13px 15px',
    fontSize: 16,
    color: '#1a2332',
    fontFamily: 'inherit',
    outline: 'none',
    background: '#f8fafc',
  };

  const etiquette: React.CSSProperties = {
    display: 'block',
    fontSize: 11,
    fontWeight: 800,
    color: '#94a3b8',
    textTransform: 'uppercase',
    letterSpacing: 0.9,
    marginBottom: 8,
  };

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
          <label htmlFor="mail" style={etiquette}>
            Adresse mail
          </label>
          <input
            id="mail"
            type="email"
            value={mail}
            onChange={(e) => setMail(e.target.value)}
            autoFocus
            autoComplete="username"
            placeholder="arogelet@emilio-immo.com"
            style={champ}
          />

          <label htmlFor="mdp" style={{ ...etiquette, marginTop: 16 }}>
            Mot de passe
          </label>
          <input
            id="mdp"
            type="password"
            value={motDePasse}
            onChange={(e) => setMotDePasse(e.target.value)}
            autoComplete="current-password"
            placeholder="••••••••••••"
            style={{ ...champ, letterSpacing: 3 }}
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
            disabled={envoi || !pret}
            style={{
              width: '100%',
              marginTop: 18,
              background: envoi || !pret ? '#d8c89a' : '#c9a84c',
              color: '#ffffff',
              border: 'none',
              borderRadius: 11,
              padding: '13px 0',
              fontSize: 14,
              fontWeight: 700,
              cursor: envoi || !pret ? 'default' : 'pointer',
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
