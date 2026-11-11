/** A manager check-in uses the page box, or the text from the prompt when the box is empty. */
export function statusChangeReason(box: string, prompted?: string | null): { ok: true; reason: string } | { ok: false } {
  const typed = String(box || '').trim();
  if (typed) return { ok: true, reason: typed };
  if (prompted == null) return { ok: false };
  const next = String(prompted).trim();
  if (!next) return { ok: false };
  return { ok: true, reason: next };
}
