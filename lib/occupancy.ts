import { HOLDING_STATUSES } from './public-quote.ts';
import { diffDays } from './date.ts';

/** Exclusive checkout used when a still-checked-in overdue stay has no known departure. */
export const OVERDUE_OPEN_CHECKOUT = '9999-12-31';

function laterDate(left: string, right: string): string {
  return left >= right ? left : right;
}

/**
 * Exclusive checkout used for occupancy on the reservations board, in
 * create/edit/move conflict checks, and in public availability.
 *
 * A still-checked-in stay occupies through max(check_out, business today).
 * Checkout day itself stays exclusive, so a new arrival can still start on
 * a scheduled departure date. When checkout is already in the past, the
 * guest keeps the room until they are actually checked out, so today and
 * later dates stay blocked.
 */
export function effectiveCheckOut(
  stay: { status: string; check_out: string },
  businessToday: string
): string {
  if (stay.status !== 'checked_in') return stay.check_out;
  const throughToday = laterDate(stay.check_out, businessToday);
  if (stay.check_out >= businessToday) return throughToday;
  return OVERDUE_OPEN_CHECKOUT;
}

/** Inclusive start, exclusive end, same overlap rule as booking conflicts. */
export function stayOccupiesRange(
  stay: { status: string; check_in: string; check_out: string },
  rangeStart: string,
  rangeEnd: string,
  businessToday: string
): boolean {
  return stay.check_in < rangeEnd && effectiveCheckOut(stay, businessToday) > rangeStart;
}

/** A holding stay that blocks a new booking on this room for [checkIn, checkOut). */
export function stayConflictsWithRange(
  stay: { status: string; check_in: string; check_out: string },
  checkIn: string,
  checkOut: string,
  businessToday: string
): boolean {
  if (!(HOLDING_STATUSES as readonly string[]).includes(stay.status)) return false;
  return stayOccupiesRange(stay, checkIn, checkOut, businessToday);
}

/**
 * Visible bar start (days from the window start) and length, clipped to
 * [from, to). Returns null when the stay does not overlap the window.
 */
export function boardBarRange(
  checkIn: string,
  occupyOut: string,
  from: string,
  to: string
): { start: number; length: number } | null {
  const clippedIn = checkIn > from ? checkIn : from;
  const clippedOut = occupyOut < to ? occupyOut : to;
  if (!(clippedIn < clippedOut)) return null;
  return { start: diffDays(from, clippedIn), length: diffDays(clippedIn, clippedOut) };
}
