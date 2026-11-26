import { NextResponse } from 'next/server';
import { isDemoMode } from '@/lib/demo/guard.mjs';
import { DEMO_SESSION_COOKIE } from '@/lib/demo/session';

export async function POST() {
  if (!isDemoMode()) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  const response = NextResponse.json({ ok: true });
  response.cookies.set(DEMO_SESSION_COOKIE, '', { httpOnly: true, sameSite: 'lax', path: '/', maxAge: 0 });
  return response;
}
