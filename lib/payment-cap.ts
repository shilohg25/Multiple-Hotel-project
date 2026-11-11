function money(value: number) {
  return Math.round(Number(value || 0) * 100) / 100;
}

export const PAYMENT_OVER_OWED = 'The payment cannot be more than the amount still owed, including payments already waiting to be confirmed.';
export const CONFIRM_OVER_TOTAL = 'This payment would be more than the stay total, so it was not confirmed. Reject it if it should not stay on the list.';

/** Submitted and confirmed payments both reserve part of the stay. Rejected ones do not. */
export function amountReservedByPayments(payments: Array<{ amount?: number | null; status?: string | null }>): number {
  return money(payments.reduce((sum, payment) => {
    const status = String(payment.status || '');
    if (status !== 'confirmed' && status !== 'submitted') return sum;
    return sum + Number(payment.amount || 0);
  }, 0));
}

export function amountConfirmed(payments: Array<{ amount?: number | null; status?: string | null; id?: string | null }>, exceptId?: string): number {
  return money(payments.reduce((sum, payment) => {
    if (String(payment.status || '') !== 'confirmed') return sum;
    if (exceptId && payment.id === exceptId) return sum;
    return sum + Number(payment.amount || 0);
  }, 0));
}

export function submitFitsStay(stayTotal: number, reserved: number, nextAmount: number): { ok: true } | { ok: false; error: string } {
  const remaining = money(Number(stayTotal || 0) - Number(reserved || 0));
  if (!(Number(nextAmount) > 0) || money(nextAmount) > remaining + 0.009) {
    return { ok: false, error: PAYMENT_OVER_OWED };
  }
  return { ok: true };
}

/** Confirm adds this payment on top of money already confirmed. Other pending proofs are not confirmed yet. */
export function confirmFitsStay(stayTotal: number, alreadyConfirmed: number, paymentAmount: number): { ok: true } | { ok: false; error: string } {
  const next = money(Number(alreadyConfirmed || 0) + Number(paymentAmount || 0));
  if (next > money(stayTotal) + 0.009) return { ok: false, error: CONFIRM_OVER_TOTAL };
  return { ok: true };
}
