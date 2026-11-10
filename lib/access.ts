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

export function canOpenPath(role: string | null | undefined, pathname: string): boolean {
  if (!isFrontline(role)) return true;
  if (DAILY_EXACT.has(pathname)) return true;
  if (pathname.startsWith('/today/')) return true;
  if (pathname.startsWith('/sales/')) return true;
  if (pathname.startsWith('/print/reports/daily')) return true;
  if (pathname.startsWith('/print/reservations/')) return true;
  if (pathname.startsWith('/reservations/') && pathname !== '/reservations') return true;
  return false;
}
