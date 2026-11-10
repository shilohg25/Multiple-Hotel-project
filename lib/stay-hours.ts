export function hourlyCharge(hours: number, hourlyRate: number): number {
  return Math.round(Number(hours || 0) * Number(hourlyRate || 0) * 100) / 100;
}

export function formatHotelTime(value: string | null | undefined, fallback: string): string {
  const raw = (value || fallback).slice(0, 5);
  const [hourText, minuteText] = raw.split(':');
  const hour = Number(hourText);
  const minute = Number(minuteText || 0);
  if (!Number.isFinite(hour) || !Number.isFinite(minute)) return fallback;
  const date = new Date(Date.UTC(2026, 0, 1, hour, minute));
  return new Intl.DateTimeFormat('en-PH', { hour: 'numeric', minute: '2-digit', timeZone: 'UTC' }).format(date);
}
