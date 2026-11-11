const LIVE_PAYMENT = new Set(['submitted', 'confirmed']);

/** Cancel the stay only when this rejection leaves no submitted or confirmed payment. */
export function shouldReleaseHoldOnReject(input: {
  reservationStatus: string;
  otherPaymentStatuses: string[];
}): boolean {
  if (input.reservationStatus !== 'payment_submitted') return false;
  return !input.otherPaymentStatuses.some((status) => LIVE_PAYMENT.has(status));
}
