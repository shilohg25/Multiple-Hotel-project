/**
 * PATCH /api/ledger body: { action: 'replace', hotel_id, client_request_id, entry }.
 * Validated before the hotel access check, so a malformed request is a 400, not a 403.
 */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type LedgerPatchBody = {
  action: 'replace';
  hotelId: string;
  clientRequestId: string;
  entry: Record<string, unknown>;
};

export function parseLedgerPatchBody(text: string): { ok: true; body: LedgerPatchBody } | { ok: false; status: 400; error: string } {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return { ok: false, status: 400, error: 'Send a JSON body.' };
  }
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return { ok: false, status: 400, error: 'Send a JSON body.' };
  const value = raw as Record<string, unknown>;
  const hotelId = typeof value.hotel_id === 'string' ? value.hotel_id.trim() : '';
  if (!hotelId || !UUID.test(hotelId)) return { ok: false, status: 400, error: 'hotel_id must be a valid hotel id.' };
  if (value.action !== 'replace') return { ok: false, status: 400, error: 'action must be "replace".' };
  const clientRequestId = typeof value.client_request_id === 'string' ? value.client_request_id.trim() : '';
  if (!clientRequestId || clientRequestId.length > 200) return { ok: false, status: 400, error: 'client_request_id of the earlier entry is required.' };
  if (clientRequestId.endsWith(':replace')) return { ok: false, status: 400, error: 'A replacement cannot be replaced again. Correct it with an adjustment.' };
  const entry = value.entry;
  if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return { ok: false, status: 400, error: 'entry (the corrected entry) is required.' };
  return { ok: true, body: { action: 'replace', hotelId, clientRequestId, entry: entry as Record<string, unknown> } };
}
