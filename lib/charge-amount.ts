export const CHARGE_AMOUNT_ERROR = 'Enter a charge amount greater than ₱0.00.';

/** True when the value can be used as a charge unit price (greater than zero). */
export function isPositiveChargeAmount(value: unknown): boolean {
  if (value === null || value === undefined) return false;
  if (typeof value === 'string' && value.trim() === '') return false;
  const amount = Number(value);
  return Number.isFinite(amount) && amount > 0;
}

/** Validation guard for Add charge. Empty, zero, and negative amounts are refused. */
export function chargeAmountRefusal(value: unknown): string | null {
  return isPositiveChargeAmount(value) ? null : CHARGE_AMOUNT_ERROR;
}
