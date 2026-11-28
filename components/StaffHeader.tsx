'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState } from 'react';
import { LanguageToggle } from '@/components/LanguageToggle';
import { formatHeaderIdentity, isNavItemActive, type NavGroup } from '@/lib/nav';
import type { Locale } from '@/lib/i18n/types';
import type { Profile } from '@/types/app';

function navLinkClass(active: boolean): string {
  return active
    ? 'shrink-0 rounded-lg bg-slate-900 px-3 py-2 text-sm font-semibold text-white'
    : 'shrink-0 rounded-lg px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100';
}

export function StaffHeader({
  homeHref,
  groups,
  locale,
  profile
}: {
  homeHref: string;
  groups: NavGroup[];
  locale: Locale;
  profile: Profile;
}) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  const identity = formatHeaderIdentity(profile.full_name, profile.role);

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
        <nav className="hidden min-w-0 flex-1 flex-wrap items-end gap-x-4 gap-y-2 md:flex" aria-label="Staff">
          {groups.map((group) => (
            <div key={group.id} className="min-w-0">
              <p className="px-3 text-[11px] font-semibold uppercase tracking-wide text-slate-500">{group.label}</p>
              <div className="flex flex-wrap items-center gap-1">
                {group.items.map((item) => {
                  const active = isNavItemActive(item.href, pathname);
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      className={navLinkClass(active)}
                      aria-current={active ? 'page' : undefined}
                    >
                      {item.label}
                    </Link>
                  );
                })}
              </div>
            </div>
          ))}
        </nav>
        <div className="ml-auto hidden shrink-0 items-center gap-3 md:flex">
          <LanguageToggle locale={locale} />
          <span className="hidden text-xs text-slate-600 lg:inline">
            {identity.name}
            {identity.roleLabel ? <span className="text-slate-500"> · {identity.roleLabel}</span> : null}
          </span>
        </div>
        <form action="/api/auth/signout" method="post" className="ml-auto shrink-0 md:ml-0">
          <button className="btn-secondary" type="submit">Sign out</button>
        </form>
      </div>
      {open ? (
        <nav id="staff-nav" className="absolute inset-x-0 top-full z-40 max-h-[70vh] overflow-y-auto border-b border-slate-200 bg-white px-3 py-3 shadow-lg md:hidden" aria-label="Staff">
          <div className="mx-auto max-w-7xl space-y-3">
            {groups.map((group) => (
              <div key={group.id}>
                <p className="px-3 text-[11px] font-semibold uppercase tracking-wide text-slate-500">{group.label}</p>
                <div className="mt-1 grid grid-cols-2 gap-1">
                  {group.items.map((item) => {
                    const active = isNavItemActive(item.href, pathname);
                    return (
                      <Link
                        key={item.href}
                        href={item.href}
                        className={navLinkClass(active)}
                        aria-current={active ? 'page' : undefined}
                        onClick={() => setOpen(false)}
                      >
                        {item.label}
                      </Link>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
          <div className="mx-auto mt-3 max-w-7xl border-t border-slate-100 pt-3">
            <LanguageToggle locale={locale} />
            <p className="mt-2 text-xs text-slate-600">
              {identity.name}
              {identity.roleLabel ? <span className="text-slate-500"> · {identity.roleLabel}</span> : null}
            </p>
          </div>
        </nav>
      ) : null}
    </header>
  );
}
