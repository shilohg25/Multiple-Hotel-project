/** Staff payment proof rules. Cash needs a note; a photo is optional. */

export const STAFF_NO_PROOF_PATH = 'staff/no-proof';
export const WALK_IN_DESK_CASH_PROOF_PATH = 'walk-in/desk-cash';

const SENTINEL_PROOF_PATHS = new Set([STAFF_NO_PROOF_PATH, WALK_IN_DESK_CASH_PROOF_PATH]);

export function normalizePaymentMethod(method: string | null | undefined): string {
  return String(method || '').trim().toLowerCase();
}

/** Desk cash. Every other method still needs a proof file. */
export function proofFileRequired(method: string | null | undefined): boolean {
  return normalizePaymentMethod(method) !== 'cash';
}

export function hasProofFile(proof: { size?: number } | null | undefined): boolean {
  return Boolean(proof && Number(proof.size) > 0);
}

export function isSentinelProofPath(path: string | null | undefined): boolean {
  return SENTINEL_PROOF_PATHS.has(String(path || '').trim());
}

export type PaymentProofCheck = { ok: true } | { ok: false; error: string };

export const PAYMENT_NOTES_REQUIRED = 'Payment information / reference details are required.';
export const PAYMENT_PROOF_REQUIRED = 'Payment proof is mandatory.';

/** Form and API share this check. Notes are required for every method, including cash. */
export function validatePaymentProofInput(input: {
  method: string | null | undefined;
  paymentDetails: string | null | undefined;
  hasProof: boolean;
}): PaymentProofCheck {
  if (!String(input.paymentDetails || '').trim()) {
    return { ok: false, error: PAYMENT_NOTES_REQUIRED };
  }
  if (proofFileRequired(input.method) && !input.hasProof) {
    return { ok: false, error: PAYMENT_PROOF_REQUIRED };
  }
  return { ok: true };
}

/** Column is NOT NULL and confirm_submitted_payment rejects a blank path, so cash without a photo reuses the existing staff sentinel. */
export function storedProofPath(input: { method: string | null | undefined; uploadedPath?: string | null }): string | { ok: false; error: string } {
  const uploaded = String(input.uploadedPath || '').trim();
  if (uploaded) return uploaded;
  if (!proofFileRequired(input.method)) return STAFF_NO_PROOF_PATH;
  return { ok: false, error: PAYMENT_PROOF_REQUIRED };
}
