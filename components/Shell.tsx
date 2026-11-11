import type { Profile } from '@/types/app';
import { isFrontline } from '@/lib/access';
import { getLocale, label } from '@/lib/i18n';
import { StaffHeader } from '@/components/StaffHeader';
import { OfflineStatusBanner } from '@/components/offline/OfflineStatusBanner';

const navItems = [
  { href: '/today', label: 'Today' },
  { href: '/dashboard', label: 'Dashboard' },
  { href: '/reservations', label: 'Reservations' },
  { href: '/board', label: 'Board' },
  { href: '/payments', label: 'Payments' },
  { href: '/sales', label: 'Daily sales' },
  { href: '/reports/daily', label: 'Reports' },
  { href: '/reports/monthly', label: 'Monthly' },
  { href: '/rooms', label: 'Rooms / Units' },
  { href: '/remittances', label: 'Remittances' },
  { href: '/day-tours', label: 'Day Tours' },
  { href: '/offline', label: 'Offline Queue' },
  { href: '/help', label: 'How to' },
  { href: '/hotels', label: 'Hotels' }
];

const frontlineHrefs = new Set(['/today', '/sales', '/offline', '/help']);

export async function Shell({ children, profile }: { children: React.ReactNode; profile: Profile }) {
  const locale = await getLocale();
  const nameFor = (href: string, fallback: string) => {
    if (href === '/today') return label(locale, 'nav.today');
    if (href === '/sales') return label(locale, 'nav.sales');
    if (href === '/help') return label(locale, 'nav.help');
    return fallback;
  };
  const visibleNavItems = isFrontline(profile.role)
    ? navItems.filter((item) => frontlineHrefs.has(item.href))
    : [...navItems, { href: '/settings', label: 'Settings' }];

  return (
    <div className="min-h-screen min-w-0">
      <StaffHeader
        homeHref={isFrontline(profile.role) ? '/today' : '/dashboard'}
        locale={locale}
        profile={profile}
        items={visibleNavItems.map((item) => ({ href: item.href, label: nameFor(item.href, item.label) }))}
      />
      <OfflineStatusBanner />
      <main className="mx-auto min-w-0 max-w-7xl px-4 py-6">{children}</main>
    </div>
  );
}
