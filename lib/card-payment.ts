import { guestCardCharge } from './card-fees.ts';

/** True when the stored amount is the guest total for this base and surcharge. */
export function cardTotalMatches(baseAmount: number, surchargePercent: number, submittedAmount: number) {
  if (!Number.isFinite(baseAmount) || baseAmount <= 0) return false;
  if (!Number.isFinite(submittedAmount) || submittedAmount <= 0) return false;
  return Math.abs(guestCardCharge(baseAmount, surchargePercent) - submittedAmount) < 0.001;
}
