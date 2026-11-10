const PROTECTED_STATUSES = new Set(['checked_in', 'checked_out']);

/**
 * Down payment confirmation may move a booking to secured.
 * It must not walk a stay backwards from checked in or checked out.
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
