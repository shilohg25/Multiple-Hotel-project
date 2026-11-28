import { EMPTY_HOTEL_MESSAGE_KEY } from '@/lib/empty-hotel';
import { getLocale, label } from '@/lib/i18n';
import { EmptyHotelState } from '@/components/EmptyHotelState';

export async function EmptyHotelStateLocalized() {
  const locale = await getLocale();
  return <EmptyHotelState message={label(locale, EMPTY_HOTEL_MESSAGE_KEY)} />;
}
