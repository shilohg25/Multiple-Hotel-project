import type { Hotel } from '@/types/app';
import { normalizeDownpaymentType } from './downpayment.ts';
import { currency } from './money.ts';

export type HotelCardBadge = {
  kind: 'active' | 'inactive' | 'ready' | 'setup';
  label: string;
};

/** Ready only when the hotel is active and has at least one active room. Inactive hotels never show Ready. */
export function hotelCardBadges(active: boolean, setupNeeded: boolean): HotelCardBadge[] {
  const badges: HotelCardBadge[] = [
    active ? { kind: 'active', label: 'Active' } : { kind: 'inactive', label: 'Inactive' }
  ];
  if (setupNeeded) {
    badges.push({ kind: 'setup', label: 'Setup needed' });
  } else if (active) {
    badges.push({ kind: 'ready', label: 'Ready' });
  }
  return badges;
}

export function hotelBadgeClass(kind: HotelCardBadge['kind']): string {
  if (kind === 'active' || kind === 'ready') return 'bg-emerald-50 text-emerald-800';
  if (kind === 'setup') return 'bg-amber-50 text-amber-900';
  return 'bg-slate-100 text-slate-700';
}

export function hotelDownpaymentSummary(
  hotel: Pick<
    Hotel,
    'downpayment_type' | 'default_downpayment_percent' | 'default_downpayment_amount' | 'default_currency'
  >
): string {
  const type = normalizeDownpaymentType(hotel.downpayment_type);
  if (type === 'percent') {
    return `Down payment: ${Number(hotel.default_downpayment_percent || 0)}% of the stay total`;
  }
  if (type === 'fixed') {
    return `Down payment: ${currency(hotel.default_downpayment_amount, hotel.default_currency)} fixed amount`;
  }
  if (type === 'first_night') {
    return 'Down payment: first-night room rate';
  }
  return 'Down payment: set on each booking';
}
