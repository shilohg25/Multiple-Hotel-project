'use client';

import Link from 'next/link';
import { useState } from 'react';
import { LanguageToggle } from '@/components/LanguageToggle';
import type { Locale } from '@/lib/i18n/types';
import type { Profile } from '@/types/app';

export function StaffHeader({
  homeHref,
  items,
  locale,
  profile
}: {
  homeHref: string;
  items: { href: string; label: string }[];
  locale: Locale;
  profile: Profile;
}) {
  const [open, setOpen] = useState(false);
  const who = `${profile.full_name || 'Staff'} - ${profile.role.replace('_', ' ')}`;

  return (
    <header className="print-hidden sticky top-0 z-40 border-b border-slate-200 bg-white">
      <div className="relative mx-auto flex max-w-7xl flex-wrap items-center gap-2 px-3 py-2">
        <button
          type="button"
          className="shrink-0 rounded-lg border border-slate-300 bg-white px-3 py-1 text-sm font-semibold text-slate-900 md:hidden"
          aria-expanded={open}
          aria-controls="staff-nav"
          onClick={() => setOpen((value) => !value)}
        >
          {open ? 'Close' : 'Menu'}
        </button>
        <Link href={homeHref} className="shrink-0 text-lg font-black tracking-tight" onClick={() => setOpen(false)}>
          Hotel Ops
        </Link>
        <nav className="hidden min-w-0 flex-1 flex-wrap items-center gap-1 md:flex" aria-label="Staff">
          {items.map((item) => (
            <Link key={item.href} href={item.href} className="shrink-0 rounded-lg px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100">
              {item.label}
            </Link>
          ))}
        </nav>
        <div className="ml-auto hidden shrink-0 items-center gap-3 md:flex">
          <LanguageToggle locale={locale} />
          <span className="hidden text-xs text-slate-500 lg:inline">{who}</span>
        </div>
        <form action="/api/auth/signout" method="post" className="ml-auto shrink-0 md:ml-0">
          <button className="btn-secondary" type="submit">Sign out</button>
        </form>
      </div>
      {open ? (
        <nav id="staff-nav" className="absolute inset-x-0 top-full z-40 max-h-[70vh] overflow-y-auto border-b border-slate-200 bg-white px-3 py-3 shadow-lg md:hidden" aria-label="Staff">
          <div className="mx-auto grid max-w-7xl grid-cols-2 gap-1">
            {items.map((item) => (
              <Link key={item.href} href={item.href} className="rounded-lg px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100" onClick={() => setOpen(false)}>
                {item.label}
              </Link>
            ))}
          </div>
          <div className="mx-auto mt-3 max-w-7xl border-t border-slate-100 pt-3">
            <LanguageToggle locale={locale} />
            <p className="mt-2 text-xs text-slate-500">{who}</p>
          </div>
        </nav>
      ) : null}
    </header>
  );
}
