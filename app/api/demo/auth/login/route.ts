import { NextResponse } from 'next/server';
import { isDemoMode } from '@/lib/demo/guard.mjs';
import { getDemoState } from '@/lib/demo/db';
import { createSessionToken, DEMO_SESSION_COOKIE, verifyPassword } from '@/lib/demo/session';

// Local demo sign-in (DEMO_MODE=1 only). Checks the scrypt hash created by `npm run demo:setup`.
export async function POST(request: Request) {
  if (!isDemoMode()) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  const payload = await request.json().catch(() => ({}));
  const email = String(payload.email || '').trim().toLowerCase();
  const password = String(payload.password || '');
  const { db } = await getDemoState();
  const result = await db.query('select id::text as id, encrypted_password from auth.users where lower(email) = $1', [email]);
  const row = result.rows[0];
  if (!row || !verifyPassword(password, row.encrypted_password as string)) {
    return NextResponse.json({ error: 'Invalid login credentials' }, { status: 400 });
  }
  const response = NextResponse.json({ ok: true });
  response.cookies.set(DEMO_SESSION_COOKIE, createSessionToken(String(row.id)), { httpOnly: true, sameSite: 'lax', path: '/', maxAge: 12 * 60 * 60 });
  return response;
}
