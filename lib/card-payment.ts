import { guestCardCharge } from './card-fees.ts';

/** True when the stored amount is the guest total for this base and surcharge. */
export function cardTotalMatches(baseAmount: number, surchargePercent: number, submittedAmount: number) {
  if (!Number.isFinite(baseAmount) || baseAmount <= 0) return false;
  if (!Number.isFinite(submittedAmount) || submittedAmount <= 0) return false;
  return Math.abs(guestCardCharge(baseAmount, surchargePercent) - submittedAmount) < 0.001;
}

/** Old offline drafts send only the typed amount. That amount is the figure before the surcharge. */
export function storedCardAmount(input: { amount: number; baseAmount: number | null; surchargePercent: number }):
  { ok: true; amount: number; notice: string | null } | { ok: false; error: string } {
  const percent = Number(input.surchargePercent || 0);
  const hasBase = input.baseAmount != null && Number.isFinite(input.baseAmount) && input.baseAmount > 0;
  if (!hasBase) {
    const base = Number(input.amount);
    if (!Number.isFinite(base) || base <= 0) return { ok: false, error: 'Enter the amount before the card surcharge.' };
    const stored = guestCardCharge(base, percent);
    return {
      ok: true,
      amount: stored,
      notice: `${base.toFixed(2)} had no separate base amount, so it was treated as the amount before the ${percent}% surcharge and recorded as ${stored.toFixed(2)}.`
    };
  }
  const base = Number(input.baseAmount);
  if (!cardTotalMatches(base, percent, Number(input.amount))) {
    const expected = guestCardCharge(base, percent);
    return { ok: false, error: `The recorded card total must include the surcharge. ${base.toFixed(2)} at ${percent}% is ${expected.toFixed(2)}.` };
  }
  return { ok: true, amount: guestCardCharge(base, percent), notice: null };
}
