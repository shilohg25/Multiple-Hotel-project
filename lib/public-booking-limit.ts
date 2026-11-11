const windowMs = 10 * 60 * 1000;
const maxPosts = 8;
const hits = new Map<string, number[]>();

/**
 * In-memory cap for public booking posts.
 * Eight requests per IP per 10 minutes. It resets when the server process restarts
 * and is not shared across multiple servers.
 */
export function allowPublicBooking(ip: string, now = Date.now()): boolean {
  const key = ip || 'unknown';
  const recent = (hits.get(key) || []).filter((stamp) => now - stamp < windowMs);
  if (recent.length >= maxPosts) {
    hits.set(key, recent);
    return false;
  }
  recent.push(now);
  hits.set(key, recent);
  return true;
}

export function publicBookingClientIp(request: Request): string {
  const forwarded = request.headers.get('x-forwarded-for') || '';
  const first = forwarded.split(',')[0]?.trim();
  return first || request.headers.get('x-real-ip') || 'unknown';
}
