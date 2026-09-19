import { NextRequest, NextResponse } from 'next/server';

/**
 * Vérifie le code d'accès et dépose le cookie de session.
 * Le cookie ne contient jamais le code : seulement son empreinte SHA-256.
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
  const attendu = process.env.EMILIO_ACCESS_CODE;
  if (!attendu) {
    return NextResponse.json(
      { ok: false, error: "Le code d'accès n'est pas configuré sur le serveur." },
      { status: 500 }
    );
  }

  let code = '';
  try {
    const body = await req.json();
    code = typeof body?.code === 'string' ? body.code : '';
  } catch {
    return NextResponse.json({ ok: false, error: 'Requête invalide.' }, { status: 400 });
  }

  // Petit délai : rend le test de codes au hasard beaucoup plus lent.
  await new Promise((r) => setTimeout(r, 400));

  if (code !== attendu) {
    return NextResponse.json({ ok: false, error: 'Code incorrect.' }, { status: 401 });
  }

  const res = NextResponse.json({ ok: true });
  res.cookies.set({
    name: COOKIE,
    value: await sha256(attendu),
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: DUREE,
  });
  return res;
}

/** Déconnexion : on efface le cookie. */
export async function DELETE() {
  const res = NextResponse.json({ ok: true });
  res.cookies.set({ name: COOKIE, value: '', path: '/', maxAge: 0 });
  return res;
}
