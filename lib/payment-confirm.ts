const PROTECTED_STATUSES = new Set(['checked_in', 'checked_out', 'cancelled', 'no_show']);

/** A received date may be today or earlier in the hotel's calendar. Null means today. */
export function paymentReceiptDate(receivedOn: string | null, today: string): { ok: true; date: string } | { ok: false; error: string } {
  if (receivedOn && receivedOn > today) {
    return { ok: false, error: 'The received date cannot be after today.' };
  }
  return { ok: true, date: receivedOn || today };
}

/**
 * Down payment confirmation may move a booking to secured.
 * It must not walk a stay backwards from checked in, checked out, cancelled, or no-show.
 * Returns the status to write, or null when the reservation status stays as it is.
 */
export function reservationStatusAfterConfirm(
  currentStatus: string,
  confirmedTotal: number,
  downpaymentRequired: number
): 'secured' | null {
  if (Number(confirmedTotal || 0) < Number(downpaymentRequired || 0)) return null;
  if (PROTECTED_STATUSES.has(currentStatus)) return null;
  return 'secured';
}
