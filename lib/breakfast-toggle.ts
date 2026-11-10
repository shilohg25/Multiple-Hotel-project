/** Written on the charge check-in posts. A staff-added breakfast line does not use this note. */
export const AUTO_BREAKFAST_NOTE = 'Posted at check-in from the breakfast settings.';

/** Audit action recorded when that auto-posted charge is deleted, so a later edit does not add it again. */
export const AUTO_BREAKFAST_REMOVED_ACTION = 'reservation.auto_breakfast_removed';

export function isAutoBreakfastCharge(charge: { category?: string | null; notes?: string | null } | null | undefined): boolean {
  if (!charge) return false;
  return charge.category === 'breakfast' && String(charge.notes || '').includes(AUTO_BREAKFAST_NOTE);
}

/** A posted auto breakfast charge stays until staff remove it. Turning the flag off does not void it. */
export function breakfastTurnOffBlocked(currentOn: boolean, nextValue: unknown, autoChargeExists: boolean): boolean {
  const turningOff = nextValue === false || nextValue === 'false';
  return Boolean(currentOn) && turningOff && autoChargeExists;
}

export function shouldPostAutoBreakfast(input: {
  status: string;
  withBreakfast: boolean;
  charges: Array<{ category?: string | null; notes?: string | null }>;
  removed: boolean;
}): boolean {
  if (input.status !== 'checked_in' || !input.withBreakfast || input.removed) return false;
  return !input.charges.some((charge) => charge.category === 'breakfast');
}

export const BREAKFAST_TURN_OFF_BLOCKED = 'Breakfast is already on this stay. Remove that charge before turning breakfast off.';
