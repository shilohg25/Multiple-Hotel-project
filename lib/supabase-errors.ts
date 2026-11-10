type PostgrestLike = { message?: string; code?: string } | null | undefined;

/** A clear message when the shared database has not had this function applied yet. */
export function unavailableDatabaseFunction(error: PostgrestLike): string | null {
  if (!error) return null;
  const message = String(error.message || '');
  const code = String(error.code || '');
  const missing = code === 'PGRST202'
    || code === '42883'
    || /could not find the function/i.test(message)
    || /schema cache/i.test(message)
    || /does not exist/i.test(message);
  if (!missing) return null;
  const name = message.match(/function\s+(?:public\.)?([a-z0-9_]+)/i)?.[1] || 'This database function';
  return `${name} is not available yet. Apply the latest database migrations, then try again.`;
}
