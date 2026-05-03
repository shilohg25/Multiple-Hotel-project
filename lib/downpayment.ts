import type { DownpaymentType, Hotel } from '@/types/app';

export function normalizeDownpaymentType(value: unknown): DownpaymentType {
  const type = String(value || 'percent');
  if (type === 'fixed' || type === 'first_night' || type === 'manual') return type;
  return 'percent';
}

export function calculateDownpayment(input: {
  hotel: Pick<Hotel, 'downpayment_type' | 'default_downpayment_percent' | 'default_downpayment_amount'>;
  total: number;
  nightlyRate: number;
  manualAmount?: number;
}) {
  const type = normalizeDownpaymentType(input.hotel.downpayment_type);
  if (type === 'fixed') return Math.max(0, Number(input.hotel.default_downpayment_amount || 0));
  if (type === 'first_night') return Math.max(0, Number(input.nightlyRate || 0));
  if (type === 'manual') return Math.max(0, Number(input.manualAmount || 0));
  return Math.max(0, Number(input.total || 0) * (Number(input.hotel.default_downpayment_percent || 0) / 100));
}

export function downpaymentLabel(type: DownpaymentType) {
  switch (type) {
    case 'fixed':
      return 'Fixed amount';
    case 'first_night':
      return 'First-night rate';
    case 'manual':
      return 'Manual per booking';
    default:
      return 'Percentage of total';
  }
}
