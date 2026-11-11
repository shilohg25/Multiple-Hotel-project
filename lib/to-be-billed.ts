import { diffDays } from './date.ts';
import { readToBeBilled } from './public-quote.ts';

export type ToBeBilledStay = {
  id: string;
  guestName: string;
  hotelName: string;
  checkIn: string;
  checkOut: string;
  source: string;
  modeOfPayment: string | null;
  status: string;
  total: number;
  received: number;
  openedOn: string;
};

export type ToBeBilledRow = {
  id: string;
  guestName: string;
  hotelName: string;
  checkIn: string;
  checkOut: string;
  source: string;
  reference: string;
  amountOwed: number;
  ageDays: number;
};

function money(value: number) {
  return Math.round(Number(value || 0) * 100) / 100;
}

export const BILLING_REFERENCE_CORRECTED = 'reservation.billing_reference_corrected';

/**
 * While money is owed, the to-be-billed marker stays. A manager may correct the
 * invoice or PO reference. Clearing the marker, or leaving the reference blank, is blocked.
 */
export function billingReferenceEdit(currentMode: string | null | undefined, nextMode: unknown):
  | { kind: 'unchanged' }
  | { kind: 'blocked' }
  | { kind: 'reference'; before: string; after: string; mode: string } {
  const current = readToBeBilled(currentMode);
  if (!current) return { kind: 'unchanged' };
  const next = readToBeBilled(String(nextMode ?? ''));
  if (!next || !next.reference.trim()) return { kind: 'blocked' };
  if (next.reference === current.reference) return { kind: 'unchanged' };
  return { kind: 'reference', before: current.reference, after: next.reference, mode: `to_be_billed:${next.reference}` };
}

/** A manager cannot clear the billing marker while the stay still owes money. */
export function billLaterMarkerChangeBlocked(input: {
  currentMode: string | null | undefined;
  nextMode: unknown;
  amountOwed: number;
}): boolean {
  if (!readToBeBilled(input.currentMode)) return false;
  if (Number(input.amountOwed || 0) <= 0.009) return false;
  return billingReferenceEdit(input.currentMode, input.nextMode).kind === 'blocked';
}

export function billingReferenceAudit(input: {
  hotelId: string;
  reservationId: string;
  actorId: string;
  before: string;
  after: string;
  when: string;
}) {
  return {
    hotel_id: input.hotelId,
    reservation_id: input.reservationId,
    actor_id: input.actorId,
    action: BILLING_REFERENCE_CORRECTED,
    details: {
      before: input.before,
      after: input.after,
      approved_by: input.actorId,
      approved_at: input.when
    }
  };
}

/** Open LGU and company bills. A stay drops off once confirmed payments cover the total. */
export function outstandingToBeBilled(today: string, stays: ToBeBilledStay[]): { rows: ToBeBilledRow[]; total: number } {
  const rows = stays.flatMap((stay) => {
    const billed = readToBeBilled(stay.modeOfPayment);
    const source = String(stay.source || '');
    if (!billed && source !== 'lgu' && source !== 'company') return [];
    if (stay.status === 'cancelled' || stay.status === 'no_show') return [];
    const owed = money(Number(stay.total || 0) - Number(stay.received || 0));
    if (owed <= 0.009) return [];
    const opened = String(stay.openedOn || stay.checkIn || today).slice(0, 10);
    return [{
      id: stay.id,
      guestName: stay.guestName || 'Guest',
      hotelName: stay.hotelName || '',
      checkIn: stay.checkIn,
      checkOut: stay.checkOut,
      source,
      reference: billed?.reference || '',
      amountOwed: owed,
      ageDays: Math.max(0, diffDays(opened, today))
    }];
  }).sort((left, right) => right.ageDays - left.ageDays || left.guestName.localeCompare(right.guestName));
  return {
    rows,
    total: money(rows.reduce((sum, row) => sum + row.amountOwed, 0))
  };
}

/** Monthly reports count only stays whose check-in falls in the selected month. */
export function toBeBilledForCheckIns(rows: ToBeBilledRow[], startDate: string, endDate: string): { rows: ToBeBilledRow[]; total: number } {
  const picked = rows.filter((row) => row.checkIn >= startDate && row.checkIn <= endDate);
  return { rows: picked, total: money(picked.reduce((sum, row) => sum + row.amountOwed, 0)) };
}
