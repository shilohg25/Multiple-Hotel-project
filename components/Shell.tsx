import type { Profile } from '@/types/app';
import { isFrontline } from '@/lib/access';
import { getLocale, label } from '@/lib/i18n';
import { getStaffNavGroups } from '@/lib/nav';
import { StaffHeader } from '@/components/StaffHeader';
import { OfflineStatusBanner } from '@/components/offline/OfflineStatusBanner';

export async function Shell({ children, profile }: { children: React.ReactNode; profile: Profile }) {
  const locale = await getLocale();
  const nameFor = (href: string, fallback: string) => {
    if (href === '/today') return label(locale, 'nav.today');
    if (href === '/sales') return label(locale, 'nav.sales');
    if (href === '/help') return label(locale, 'nav.help');
    return fallback;
  };
  const groups = getStaffNavGroups(profile.role).map((group) => ({
    ...group,
    items: group.items.map((item) => ({ href: item.href, label: nameFor(item.href, item.label) }))
  }));

  return (
    <div className="min-h-screen min-w-0">
      <StaffHeader
        homeHref={isFrontline(profile.role) ? '/today' : '/dashboard'}
        locale={locale}
        profile={profile}
        groups={groups}
      />
      <OfflineStatusBanner />
      <main className="mx-auto min-w-0 max-w-7xl px-4 py-6">{children}</main>
    </div>
  );
}
