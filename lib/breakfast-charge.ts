function money(value: number) {
  return Math.round(Number(value || 0) * 100) / 100;
}

/** Guest breakfast for a public quote and for the check-in folio. One place only. */
export const PUBLIC_BREAKFAST = {
  perRoomPerNight: 500,
  extraHeadPerNight: 250,
  includedHeads: 2
} as const;

/**
 * ₱500 per room per night covers the first two guests.
 * TODO(Shiloh): confirm a single guest still pays the full ₱500, and that a 3rd head
 * may be added at ₱250 when the room capacity allows. "Max 2 per room" is read here
 * as two heads included, not a hard stop.
 */
export function guestBreakfastCharge(nights: number, guestCount: number) {
  const nightCount = Math.max(1, Math.floor(Number(nights) || 1));
  const heads = Math.max(1, Math.floor(Number(guestCount) || 1));
  const extraHeads = Math.max(0, heads - PUBLIC_BREAKFAST.includedHeads);
  const perNight = PUBLIC_BREAKFAST.perRoomPerNight + extraHeads * PUBLIC_BREAKFAST.extraHeadPerNight;
  const guestTotal = money(perNight * nightCount);
  const line = extraHeads === 0
    ? `Breakfast ₱${PUBLIC_BREAKFAST.perRoomPerNight} per room × ${nightCount} night(s)`
    : `Breakfast ₱${PUBLIC_BREAKFAST.perRoomPerNight} per room + ₱${PUBLIC_BREAKFAST.extraHeadPerNight} × ${extraHeads} extra head(s) × ${nightCount} night(s)`;
  return { nights: nightCount, heads, extraHeads, perNight, guestTotal, line };
}

/** Guest pays the shared breakfast rule. The outlet is still owed its per-head setting. */
export function breakfastBill(input: { nights: number; guestCount: number; ratePerRoom?: number; outletPerHead: number }) {
  const charge = guestBreakfastCharge(input.nights, input.guestCount);
  const outletPerHead = Number(input.outletPerHead);
  return {
    nights: charge.nights,
    heads: charge.heads,
    extraHeads: charge.extraHeads,
    guestTotal: charge.guestTotal,
    outletOwed: money(outletPerHead * charge.heads * charge.nights),
    line: charge.line
  };
}
