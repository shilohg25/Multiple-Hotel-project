import Link from 'next/link';
import type { Profile } from '@/types/app';
import { isFrontline } from '@/lib/access';
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
  { href: '/hotels', label: 'Hotels' }
];

const frontlineHrefs = new Set(['/today', '/sales', '/offline']);

export function Shell({ children, profile }: { children: React.ReactNode; profile: Profile }) {
  const visibleNavItems = isFrontline(profile.role)
    ? navItems.filter((item) => frontlineHrefs.has(item.href))
    : [...navItems, { href: '/settings', label: 'Settings' }];

  return (
    <div className="min-h-screen">
      <header className="print-hidden sticky top-0 z-40 border-b border-slate-200 bg-white/90 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3">
          <Link href={isFrontline(profile.role) ? '/today' : '/dashboard'} className="text-lg font-black tracking-tight">
            Hotel Ops
          </Link>
          <nav className="flex flex-wrap items-center gap-1">
            {visibleNavItems.map((item) => (
              <Link key={item.href} href={item.href} className="rounded-lg px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100">
                {item.label}
              </Link>
            ))}
          </nav>
          <div className="flex items-center gap-3">
            <span className="hidden text-xs text-slate-500 sm:inline">
              {profile.full_name || 'Staff'} - {profile.role.replace('_', ' ')}
            </span>
            <form action="/api/auth/signout" method="post">
              <button className="btn-secondary" type="submit">Sign out</button>
            </form>
          </div>
        </div>
      </header>
      <OfflineStatusBanner />
      <main className="mx-auto max-w-7xl px-4 py-6">{children}</main>
    </div>
  );
}
