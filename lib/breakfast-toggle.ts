/** A posted breakfast charge stays until staff remove it. Turning the flag off does not void it. */
export function breakfastTurnOffBlocked(currentOn: boolean, nextValue: unknown, chargeExists: boolean): boolean {
  const turningOff = nextValue === false || nextValue === 'false';
  return Boolean(currentOn) && turningOff && chargeExists;
}

export const BREAKFAST_TURN_OFF_BLOCKED = 'Breakfast is already on this stay. Remove that charge before turning breakfast off.';
