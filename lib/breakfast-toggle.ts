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

/** Owners can delete any folio charge. A manager can delete the automatic extra bed, which records the removal marker. */
export function canDeleteFolioCharge(role: string, charge: { category?: string | null; notes?: string | null } | null | undefined): boolean {
  if (role === 'owner') return true;
  return role === 'manager' && isAutoPostedCharge(charge);
}

/** A posted auto breakfast charge stays until staff remove it. Turning the flag off does not void it. */
export function breakfastTurnOffBlocked(currentOn: boolean, nextValue: unknown, autoChargeExists: boolean): boolean {
  const turningOff = nextValue === false || nextValue === 'false';
  return Boolean(currentOn) && turningOff && autoChargeExists;
}

/** The audit query found reservation.auto_breakfast_removed. Display and check-in both use this. */
export function autoChargeWasRemoved(rows: Array<{ id?: string }> | null | undefined): boolean {
  return Boolean(rows?.length);
}

/** A failed audit read is not proof the charge was removed. The extra bed stays due, and the error is logged by the caller. */
export function autoChargeRemovedFromRead(error: unknown, rows: Array<{ id?: string }> | null | undefined): boolean {
  if (error) return false;
  return autoChargeWasRemoved(rows);
}

/**
 * An extra bed is still owed only when the price is above zero, nothing is posted,
 * and the auto charge was not deleted. Check-in posts only when this is true.
 */
export function extraBedStillDue(input: {
  extraBedTotal: number;
  charges: Array<{ category?: string | null; notes?: string | null }>;
  removed: boolean;
}): boolean {
  if (input.removed || !(Number(input.extraBedTotal) > 0)) return false;
  return !input.charges.some((charge) => isAutoPostedCharge(charge) || charge.category === 'extra_bed');
}

export function shouldPostAutoStayCharge(input: {
  status: string;
  extraBedTotal: number;
  charges: Array<{ category?: string | null; notes?: string | null }>;
  removed: boolean;
}): boolean {
  return input.status === 'checked_in' && extraBedStillDue(input);
}

export const BREAKFAST_TURN_OFF_BLOCKED = 'This stay already has an automatic charge. Remove that charge before turning breakfast off.';
