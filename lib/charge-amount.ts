export const CHARGE_AMOUNT_ERROR = 'Enter a charge amount greater than ₱0.00.';

function roundedToCents(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  if (typeof value === 'string' && value.trim() === '') return null;
  const amount = Number(value);
  if (!Number.isFinite(amount)) return null;
  return Math.round(amount * 100) / 100;
}

/** True when the value can be used as a charge unit price (greater than ₱0.00 after 2-decimal rounding). */
export function isPositiveChargeAmount(value: unknown): boolean {
  const rounded = roundedToCents(value);
  return rounded != null && rounded > 0;
}

/** Validation guard for Add charge. Empty, zero, negative, and sub-cent amounts are refused. */
export function chargeAmountRefusal(value: unknown): string | null {
  return isPositiveChargeAmount(value) ? null : CHARGE_AMOUNT_ERROR;
}

/** Inline error only after the unit-price field is edited, blurred, or the form is submitted. */
export function chargeAmountErrorVisible(interacted: boolean, value: unknown): boolean {
  return interacted && chargeAmountRefusal(value) != null;
}
