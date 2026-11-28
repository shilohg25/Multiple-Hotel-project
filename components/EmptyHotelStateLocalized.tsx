import { emptyHotelMessageKey } from '@/lib/empty-hotel';
import { requireStaff } from '@/lib/auth';
import { getLocale, label } from '@/lib/i18n';
import { EmptyHotelState } from '@/components/EmptyHotelState';

export async function EmptyHotelStateLocalized() {
  const staff = await requireStaff();
  const locale = await getLocale();
  return <EmptyHotelState message={label(locale, emptyHotelMessageKey(staff.profile.role))} />;
}
