export const RATE_CHANNELS = ['walk_in', 'ota', 'short_time'] as const;
export type RateChannel = (typeof RATE_CHANNELS)[number];

export function stayTotal(nightlyRate: number, nights: number, surcharge = 0): number {
  const nightsCount = Math.max(0, Number(nights) || 0);
  return Math.round((Number(nightlyRate || 0) * nightsCount + Number(surcharge || 0)) * 100) / 100;
}

export function channelRate(rates: { channel: string; rate: number | string }[], channel: string): number | null {
  const match = rates.find((item) => item.channel === channel);
  if (!match) return null;
  const value = Number(match.rate);
  return Number.isFinite(value) ? value : null;
}
