export const APP_ROLES = ['owner', 'manager', 'front_desk', 'cashier', 'restaurant_staff'] as const;
export type AppRole = (typeof APP_ROLES)[number];

export type Capability = 'daily' | 'approve' | 'settings' | 'monthly' | 'owner';

export function isFrontline(role: string | null | undefined): boolean {
  return role === 'front_desk' || role === 'cashier' || role === 'restaurant_staff';
}

export function allows(role: string | null | undefined, capability: Capability): boolean {
  if (role === 'owner') return true;
  if (role === 'manager') return capability !== 'owner';
  if (isFrontline(role)) return capability === 'daily';
  return false;
}

const DAILY_EXACT = new Set(['/today', '/sales', '/offline', '/reservations/new']);

/** Path only, without a host, query, or trailing slash. */
export function normalizePathname(value: string | null | undefined): string {
  const raw = String(value || '').trim();
  if (!raw) return '';
  let path = raw;
  if (raw.startsWith('http://') || raw.startsWith('https://')) {
    try {
      path = new URL(raw).pathname;
    } catch {
      path = raw;
    }
  }
  path = path.split('?')[0].split('#')[0];
  if (!path.startsWith('/')) path = `/${path}`;
  if (path.length > 1 && path.endsWith('/')) path = path.slice(0, -1);
  return path;
}

export function canOpenPath(role: string | null | undefined, pathname: string): boolean {
  pathname = normalizePathname(pathname);
  if (!isFrontline(role)) return true;
  if (!pathname) return true;
  if (DAILY_EXACT.has(pathname) || pathname === '/dashboard') return true;
  if (pathname.startsWith('/today/')) return true;
  if (pathname.startsWith('/sales/')) return true;
  if (pathname.startsWith('/print/reports/daily')) return true;
  if (pathname.startsWith('/print/reservations/')) return true;
  if (pathname.startsWith('/reservations/') && pathname !== '/reservations') return true;
  return false;
}
