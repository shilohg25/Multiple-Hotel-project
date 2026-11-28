type PostgrestLike = { message?: string; code?: string } | null | undefined;

/** Postgres SQLSTATE for writing a non-DEFAULT value to a generated column. */
export const GENERATED_COLUMN_SQLSTATE = '428C9';

/**
 * reservation_charges.total_amount is GENERATED ALWAYS in
 * 0002_pricing_charges_remittance_day_tours.sql. The overlapping folio 0002
 * (the one APPLY_ORDER.md uses for local Postgres) leaves it as a writable
 * numeric with default 0. Live and DEMO_MODE (which applies every 0002 file,
 * first one wins) have the generated column — UPDATE then fails with
 * `column "total_amount" can only be updated to DEFAULT`, not the "generated
 * column" / INSERT wording the retry used to look for.
 *
 * Send total_amount on the first write so a writable-column database still
 * stores the rounded quantity * unit_price total. Retry without it only when
 * Postgres (or PostgREST) reports a generated-column rejection.
 */
export function isGeneratedTotalAmountError(error: PostgrestLike): boolean {
  if (!error) return false;
  if (String(error.code || '').toUpperCase() === GENERATED_COLUMN_SQLSTATE) return true;
  const message = String(error.message || '');
  return /generated column/i.test(message)
    || /non-DEFAULT value into column "total_amount"/i.test(message)
    || /column "total_amount" can only be updated to DEFAULT/i.test(message);
}

export function withoutTotalAmount<T extends Record<string, unknown>>(payload: T): Omit<T, 'total_amount'> {
  const { total_amount: _ignored, ...rest } = payload;
  return rest;
}

/** Payload for a second write after a generated-column error, or null if no retry. */
export function retryPayloadWithoutTotalAmount<T extends Record<string, unknown>>(
  payload: T,
  error: PostgrestLike
): Omit<T, 'total_amount'> | null {
  if (!isGeneratedTotalAmountError(error)) return null;
  if (!Object.prototype.hasOwnProperty.call(payload, 'total_amount')) return null;
  return withoutTotalAmount(payload);
}
