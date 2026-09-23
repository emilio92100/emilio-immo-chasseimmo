import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

/**
 * Ouvre la porte du CRM.
 *
 * ⚠️ Cette route ne vérifie plus un code : elle vérifie une **session
 * Supabase**. La page /login connecte Alexandre auprès de Supabase, récupère
 * le jeton de sa session, et l'envoie ici. On le revérifie auprès de Supabase
 * — on ne croit pas le navigateur sur parole — puis on pose le cookie que
 * src/proxy.ts attend.
 *
 * Le cookie ne contient toujours que l'empreinte SHA-256 de
 * `EMILIO_ACCESS_CODE` : c'est lui, désormais, le secret partagé entre cette
 * route et le portail. Il n'est plus tapé par personne, et `proxy.ts` n'a
 * pas eu à changer d'une ligne.
 *
 * ⚠️ Ce cookie ne donne accès à AUCUNE donnée. Il ne fait qu'autoriser
 * l'affichage des pages. Les données, elles, sont protégées par le RLS
 * (voir migration-rls.sql) : sans session Supabase valide dans le navigateur,
 * les écrans du CRM s'affichent vides. Les deux serrures vont ensemble.
 */

const COOKIE = 'emilio_acces';
const DUREE = 60 * 60 * 24 * 30; // 30 jours

async function sha256(texte: string): Promise<string> {
  const data = new TextEncoder().encode(texte);
  const buf = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

export async function POST(req: NextRequest) {
  const secret = process.env.EMILIO_ACCESS_CODE;
  if (!secret) {
    return NextResponse.json(
      { ok: false, error: "EMILIO_ACCESS_CODE n'est pas configuré sur le serveur." },
      { status: 500 },
    );
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const cle = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !cle) {
    return NextResponse.json(
      { ok: false, error: "La connexion à Supabase n'est pas configurée sur le serveur." },
      { status: 500 },
    );
  }

  let token = '';
  try {
    const body = await req.json();
    token = typeof body?.token === 'string' ? body.token : '';
  } catch {
    return NextResponse.json({ ok: false, error: 'Requête invalide.' }, { status: 400 });
  }

  if (!token) {
    return NextResponse.json({ ok: false, error: 'Session manquante.' }, { status: 400 });
  }

  /* On demande à Supabase à qui appartient ce jeton. Un jeton inventé,
     expiré ou signé ailleurs ne passe pas : c'est Supabase qui tranche, pas
     nous. On n'utilise volontairement PAS la clé de service ici — la clé
     publique suffit à faire valider un jeton, et il n'y a aucune raison de
     faire circuler la clé privée pour ça. */
  let utilisateur: { id: string; email?: string } | null = null;
  try {
    const supabase = createClient(url, cle, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data, error } = await supabase.auth.getUser(token);
    if (error || !data?.user) {
      return NextResponse.json({ ok: false, error: 'Session refusée.' }, { status: 401 });
    }
    utilisateur = { id: data.user.id, email: data.user.email };
  } catch {
    return NextResponse.json(
      { ok: false, error: 'Vérification impossible. Réessayez.' },
      { status: 503 },
    );
  }

  /* Une liste blanche d'adresses, si un jour elle est renseignée.
     Tant qu'elle est vide, tout compte Supabase valide du projet entre — et
     c'est suffisant : les comptes sont créés à la main, il n'y a pas
     d'inscription ouverte sur ce projet. */
  const autorises = (process.env.EMILIO_MAILS_AUTORISES || '')
    .split(',')
    .map((m) => m.trim().toLowerCase())
    .filter(Boolean);

  if (autorises.length > 0) {
    const mail = (utilisateur.email || '').toLowerCase();
    if (!autorises.includes(mail)) {
      return NextResponse.json(
        { ok: false, error: "Ce compte n'a pas accès à ce CRM." },
        { status: 403 },
      );
    }
  }

  const res = NextResponse.json({ ok: true });
  res.cookies.set({
    name: COOKIE,
    value: await sha256(secret),
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: DUREE,
  });
  return res;
}

/** Déconnexion : on efface le cookie. La session Supabase, elle, est fermée
 *  côté navigateur par `supabase.auth.signOut()`. */
export async function DELETE() {
  const res = NextResponse.json({ ok: true });
  res.cookies.set({ name: COOKIE, value: '', path: '/', maxAge: 0 });
  return res;
}
