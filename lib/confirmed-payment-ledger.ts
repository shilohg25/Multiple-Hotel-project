/**
 * The same ledger row confirm_submitted_payment inserts.
 * One row per confirmed payment, dated on the hotel's business today, not the stay date.
 * Day close reads this row. Do not also add the payment amount beside it.
 */
export function confirmedPaymentLedgerRow(input: {
  hotelId: string;
  reservationId: string;
  paymentId: string;
  amount: number;
  method: string;
  guestName?: string | null;
  entryDate: string;
  actorId?: string | null;
}) {
  return {
    hotel_id: input.hotelId,
    reservation_id: input.reservationId,
    entry_date: input.entryDate,
    category: 'room_payment',
    description: `Confirmed payment for ${input.guestName || 'guest'} (${input.paymentId})`,
    amount: input.amount,
    payment_method: input.method,
    is_collectible: false,
    created_by: input.actorId || null
  };
}
