const DAY = 24 * 60 * 60 * 1000;

export function toISODate(date: Date): string {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  return d.toISOString().slice(0, 10);
}

export function parseISODate(value: string): Date {
  const [year, month, day] = value.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day));
}

export function addDays(value: string | Date, days: number): Date {
  const date = typeof value === 'string' ? parseISODate(value) : value;
  return new Date(date.getTime() + days * DAY);
}

export function diffDays(start: string | Date, end: string | Date): number {
  const a = typeof start === 'string' ? parseISODate(start) : start;
  const b = typeof end === 'string' ? parseISODate(end) : end;
  return Math.round((b.getTime() - a.getTime()) / DAY);
}

export function eachDate(start: string, end: string): string[] {
  const days = Math.max(0, diffDays(start, end));
  return Array.from({ length: days }, (_, i) => toISODate(addDays(start, i)));
}

export function monthRange(date = new Date()): { from: string; to: string } {
  const first = new Date(Date.UTC(date.getFullYear(), date.getMonth(), 1));
  const next = new Date(Date.UTC(date.getFullYear(), date.getMonth() + 1, 1));
  return { from: toISODate(first), to: toISODate(next) };
}

export function formatDate(value: string): string {
  return new Intl.DateTimeFormat('en-PH', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC'
  }).format(parseISODate(value));
}
