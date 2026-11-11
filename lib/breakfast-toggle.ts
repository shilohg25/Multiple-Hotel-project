/** Written on the charge check-in posts. There is no source column, so this note is the flag. */
export const AUTO_POST_SOURCE = 'source:auto';

/** Older check-in breakfast rows used this sentence before extra beds replaced that charge. */
export const AUTO_BREAKFAST_NOTE = 'Posted at check-in from the breakfast settings.';

/** Audit action recorded when an automatic charge is deleted, so a later edit does not add it again. */
export const AUTO_BREAKFAST_REMOVED_ACTION = 'reservation.auto_breakfast_removed';

export function isAutoPostedCharge(charge: { category?: string | null; notes?: string | null } | null | undefined): boolean {
  if (!charge) return false;
  const notes = String(charge.notes || '');
  return notes.includes(AUTO_POST_SOURCE) || notes.includes(AUTO_BREAKFAST_NOTE);
}

export function isAutoBreakfastCharge(charge: { category?: string | null; notes?: string | null } | null | undefined): boolean {
  return isAutoPostedCharge(charge);
}

/** A posted auto breakfast charge stays until staff remove it. Turning the flag off does not void it. */
export function breakfastTurnOffBlocked(currentOn: boolean, nextValue: unknown, autoChargeExists: boolean): boolean {
  const turningOff = nextValue === false || nextValue === 'false';
  return Boolean(currentOn) && turningOff && autoChargeExists;
}

export function shouldPostAutoStayCharge(input: {
  status: string;
  extraBedTotal: number;
  charges: Array<{ category?: string | null; notes?: string | null }>;
  removed: boolean;
}): boolean {
  if (input.status !== 'checked_in' || input.removed || !(Number(input.extraBedTotal) > 0)) return false;
  return !input.charges.some((charge) => isAutoPostedCharge(charge) || charge.category === 'extra_bed');
}

export const BREAKFAST_TURN_OFF_BLOCKED = 'This stay already has an automatic charge. Remove that charge before turning breakfast off.';
