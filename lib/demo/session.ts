import 'server-only';

import crypto from 'node:crypto';

export const DEMO_SESSION_COOKIE = 'hotel_demo_session';

const SECRET_KEY = Symbol.for('hotel.demo.sessionSecret');

function secret(): Buffer {
  const g = globalThis as unknown as Record<symbol, Buffer | undefined>;
  if (!g[SECRET_KEY]) g[SECRET_KEY] = crypto.randomBytes(32); // per server process: restart = sign in again
  return g[SECRET_KEY]!;
}

function sign(value: string) {
  return crypto.createHmac('sha256', secret()).update(value).digest('base64url');
}

export function createSessionToken(userId: string) {
  const payload = `${userId}.${Date.now()}`;
  return `${payload}.${sign(payload)}`;
}

export function readSessionToken(token: string | undefined | null): string | null {
  if (!token) return null;
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  const payload = `${parts[0]}.${parts[1]}`;
  const expected = Buffer.from(sign(payload));
  const given = Buffer.from(parts[2]);
  if (expected.length !== given.length || !crypto.timingSafeEqual(expected, given)) return null;
  if (Date.now() - Number(parts[1]) > 12 * 60 * 60 * 1000) return null;
  return parts[0];
}

export function verifyPassword(password: string, stored: string | null | undefined): boolean {
  if (!stored) return false;
  const [scheme, saltHex, hashHex] = stored.split('$');
  if (scheme !== 'scrypt' || !saltHex || !hashHex) return false;
  const derived = crypto.scryptSync(password, Buffer.from(saltHex, 'hex'), 32);
  const expected = Buffer.from(hashHex, 'hex');
  return expected.length === derived.length && crypto.timingSafeEqual(expected, derived);
}
