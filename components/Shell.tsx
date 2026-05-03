import Link from 'next/link';
import type { Profile } from '@/types/app';

const navItems = [
  { href: '/dashboard', label: 'Dashboard' },
  { href: '/reservations', label: 'Reservations' },
  { href: '/payments', label: 'Payments' },
  { href: '/sales', label: 'Sales / Cash' },
  { href: '/rooms', label: 'Rooms' },
  { href: '/hotels', label: 'Hotels' }
];

export function Shell({ children, profile }: { children: React.ReactNode; profile: Profile }) {
  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-40 border-b border-slate-200 bg-white/90 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3">
          <Link href="/dashboard" className="text-lg font-black tracking-tight">
            Hotel Ops
          </Link>
          <nav className="hidden items-center gap-1 md:flex">
            {navItems.map((item) => (
              <Link key={item.href} href={item.href} className="rounded-lg px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100">
                {item.label}
              </Link>
            ))}
          </nav>
          <div className="flex items-center gap-3">
            <span className="hidden text-xs text-slate-500 sm:inline">
              {profile.full_name || 'Staff'} · {profile.role.replace('_', ' ')}
            </span>
            <form action="/api/auth/signout" method="post">
              <button className="btn-secondary" type="submit">Sign out</button>
            </form>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-7xl px-4 py-6">{children}</main>
    </div>
  );
}
