function money(value: number) {
  return Math.round(Number(value || 0) * 100) / 100;
}

/** Guest pays the room breakfast rate once per night. The outlet is owed the per-head amount for each guest each night. */
export function breakfastBill(input: { nights: number; guestCount: number; ratePerRoom: number; outletPerHead: number }) {
  const nights = Math.max(1, Math.floor(Number(input.nights) || 1));
  const heads = Math.max(1, Math.floor(Number(input.guestCount) || 1));
  const ratePerRoom = Number(input.ratePerRoom);
  const outletPerHead = Number(input.outletPerHead);
  return {
    nights,
    heads,
    guestTotal: money(ratePerRoom * nights),
    outletOwed: money(outletPerHead * heads * nights)
  };
}
