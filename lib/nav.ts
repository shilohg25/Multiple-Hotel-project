import { isFrontline, normalizePathname } from './access.ts';

export type NavItem = {
  href: string;
  label: string;
};

export type NavGroup = {
  id: string;
  label: string;
  items: NavItem[];
};

const FRONTLINE_HREFS = new Set(['/today', '/sales', '/offline', '/help']);
const MANAGER_HIDDEN_HREFS = new Set(['/board']);

const NAV_GROUPS: NavGroup[] = [
  {
    id: 'daily',
    label: 'Daily',
    items: [
      { href: '/today', label: 'Today' },
      { href: '/dashboard', label: 'Dashboard' },
      { href: '/reservations', label: 'Reservations' },
      { href: '/board', label: 'Board' },
      { href: '/payments', label: 'Payments' },
      { href: '/sales', label: 'Daily cash sheet' }
    ]
  },
  {
    id: 'reporting',
    label: 'Reporting',
    items: [
      { href: '/reports/daily', label: 'Reports' },
      { href: '/reports/monthly', label: 'Monthly' },
      { href: '/remittances', label: 'Remittances' }
    ]
  },
  {
    id: 'property',
    label: 'Property',
    items: [
      { href: '/rooms', label: 'Rooms / Units' },
      { href: '/day-tours', label: 'Day Tours' },
      { href: '/hotels', label: 'Hotels' }
    ]
  },
  {
    id: 'more',
    label: 'More',
    items: [
      { href: '/offline', label: 'Offline Queue' },
      { href: '/help', label: 'How to' },
      { href: '/settings', label: 'Settings' }
    ]
  }
];

const ROLE_LABELS: Record<string, string> = {
  owner: 'Owner',
  manager: 'Manager',
  front_desk: 'Front desk',
  cashier: 'Cashier',
  restaurant_staff: 'Restaurant staff'
};

function filterGroupItems(role: string | null | undefined, items: NavItem[]): NavItem[] {
  if (isFrontline(role)) {
    return items.filter((item) => FRONTLINE_HREFS.has(item.href));
  }
  if (role === 'manager') {
    return items.filter((item) => !MANAGER_HIDDEN_HREFS.has(item.href));
  }
  return items;
}

/** Grouped staff menu. Frontline stays on the daily screens; managers lose redundant Board; owners keep every current link. */
export function getStaffNavGroups(role: string | null | undefined): NavGroup[] {
  return NAV_GROUPS.map((group) => ({
    ...group,
    items: filterGroupItems(role, group.items)
  })).filter((group) => group.items.length > 0);
}

export function flattenNavItems(groups: NavGroup[]): NavItem[] {
  return groups.flatMap((group) => group.items);
}

/** True when this nav href is the current page or a parent of it (for example /today on /today/close). */
export function isNavItemActive(href: string, pathname: string | null | undefined): boolean {
  const item = normalizePathname(href);
  const path = normalizePathname(pathname);
  if (!item || !path) return false;
  if (path === item) return true;
  return item !== '/' && path.startsWith(`${item}/`);
}

export function formatHeaderIdentity(
  fullName: string | null | undefined,
  role: string | null | undefined
): { name: string; roleLabel: string | null } {
  const name = String(fullName || '').trim() || 'Staff';
  const roleKey = String(role || '').trim();
  if (!roleKey) return { name, roleLabel: null };

  const roleLabel = ROLE_LABELS[roleKey] || roleKey.replaceAll('_', ' ');
  const nameNorm = name.toLowerCase().replace(/[_-]+/g, ' ').replace(/\s+/g, ' ').trim();
  const candidates = [roleLabel, roleKey.replaceAll('_', ' '), roleKey].map((value) =>
    value.toLowerCase().replace(/[_-]+/g, ' ').replace(/\s+/g, ' ').trim()
  );
  if (candidates.some((candidate) => candidate && nameNorm.includes(candidate))) {
    return { name, roleLabel: null };
  }
  return { name, roleLabel };
}
