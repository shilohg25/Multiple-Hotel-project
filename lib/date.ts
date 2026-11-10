const DAY = 24 * 60 * 60 * 1000;

/** IANA zone for Navarro, Sotera, Tagosilangan, and Tago Resto until a hotel overrides it. */
export const DEFAULT_BUSINESS_TIMEZONE = 'Asia/Manila';

export function businessTimeZone(timeZone?: string | null): string {
  const value = String(timeZone || '').trim();
  if (!value) return DEFAULT_BUSINESS_TIMEZONE;
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: value }).format(0);
    return value;
  } catch {
    return DEFAULT_BUSINESS_TIMEZONE;
  }
}

type ZonedParts = {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
};

export function zonedParts(date: Date, timeZone?: string | null): ZonedParts {
  const zone = businessTimeZone(timeZone);
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: zone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23'
  });
  const parts = formatter.formatToParts(date);
  const read = (type: Intl.DateTimeFormatPartTypes) => Number(parts.find((part) => part.type === type)?.value || 0);
  let hour = read('hour');
  if (hour === 24) hour = 0;
  return {
    year: read('year'),
    month: read('month'),
    day: read('day'),
    hour,
    minute: read('minute'),
    second: read('second')
  };
}

function pad(value: number): string {
  return String(value).padStart(2, '0');
}

export function formatIsoDate(year: number, month: number, day: number): string {
  return `${year}-${pad(month)}-${pad(day)}`;
}

/** Calendar date in the hotel's timezone. This is the business "today", not the UTC date. */
export function businessToday(timeZone?: string | null, now: Date = new Date()): string {
  const parts = zonedParts(now, timeZone);
  return formatIsoDate(parts.year, parts.month, parts.day);
}

export function businessMonth(timeZone?: string | null, now: Date = new Date()): string {
  return businessToday(timeZone, now).slice(0, 7);
}

function wallClockUtc(parts: Pick<ZonedParts, 'year' | 'month' | 'day' | 'hour' | 'minute' | 'second'>): number {
  return Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second);
}

/**
 * UTC instant for a wall-clock time in `timeZone`.
 * The first pass removes the zone offset. A second pass only runs when that
 * instant does not display as the requested wall clock (DST gap or overlap).
 * Asia/Manila is UTC+8 all year, so the first pass is exact.
 */
export function zonedTimeToUtc(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
  second: number,
  timeZone?: string | null
): Date {
  const zone = businessTimeZone(timeZone);
  const desired = { year, month, day, hour, minute, second };
  const utcGuess = wallClockUtc(desired);
  const shown = zonedParts(new Date(utcGuess), zone);
  let utc = utcGuess - (wallClockUtc(shown) - utcGuess);
  const check = zonedParts(new Date(utc), zone);
  if (
    check.year !== year ||
    check.month !== month ||
    check.day !== day ||
    check.hour !== hour ||
    check.minute !== minute ||
    check.second !== second
  ) {
    utc -= wallClockUtc(check) - wallClockUtc(desired);
  }
  return new Date(utc);
}

/** Inclusive start and end timestamps for one business calendar day. */
export function localDayBounds(date: string, timeZone?: string | null): { start: string; end: string } {
  const [year, month, day] = date.split('-').map(Number);
  const start = zonedTimeToUtc(year, month, day, 0, 0, 0, timeZone);
  const end = zonedTimeToUtc(year, month, day, 23, 59, 59, timeZone);
  end.setUTCMilliseconds(999);
  return { start: start.toISOString(), end: end.toISOString() };
}

export function localMonthBounds(month: string, timeZone?: string | null) {
  const [yearText, monthText] = month.split('-');
  const year = Number(yearText);
  const monthNumber = Number(monthText);
  const daysInMonth = new Date(Date.UTC(year, monthNumber, 0)).getUTCDate();
  const days = Array.from({ length: daysInMonth }, (_, index) => formatIsoDate(year, monthNumber, index + 1));
  const startDate = days[0];
  const endDate = days[days.length - 1];
  return {
    startDate,
    endDate,
    days,
    start: localDayBounds(startDate, timeZone).start,
    end: localDayBounds(endDate, timeZone).end
  };
}

export function toISODate(date: Date): string {
  return formatIsoDate(date.getUTCFullYear(), date.getUTCMonth() + 1, date.getUTCDate());
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
  return Array.from({ length: days }, (_, index) => toISODate(addDays(start, index)));
}

/** Inclusive start, exclusive end (first day of the next business month). */
export function monthRange(date = new Date(), timeZone?: string | null): { from: string; to: string } {
  const month = businessMonth(timeZone, date);
  const { startDate } = localMonthBounds(month, timeZone);
  const [year, monthNumber] = month.split('-').map(Number);
  const nextMonth = monthNumber === 12 ? 1 : monthNumber + 1;
  const nextYear = monthNumber === 12 ? year + 1 : year;
  return { from: startDate, to: formatIsoDate(nextYear, nextMonth, 1) };
}

export function formatDate(value: string, timeZone?: string | null): string {
  return new Intl.DateTimeFormat('en-PH', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    timeZone: businessTimeZone(timeZone)
  }).format(parseISODate(value));
}

export function timestampInRange(value: string | null | undefined, start: string, end: string): boolean {
  if (!value) return false;
  const time = Date.parse(value);
  if (Number.isNaN(time)) return false;
  return time >= Date.parse(start) && time <= Date.parse(end);
}
