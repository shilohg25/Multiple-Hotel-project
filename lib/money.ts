export function currency(amount: number | string | null | undefined, code = 'PHP'): string {
  const value = Number(amount ?? 0);
  return new Intl.NumberFormat('en-PH', {
    style: 'currency',
    currency: code,
    minimumFractionDigits: 2
  }).format(value);
}

export function toNumber(value: FormDataEntryValue | string | number | null | undefined, fallback = 0): number {
  if (typeof value === 'number') return Number.isFinite(value) ? value : fallback;
  const parsed = Number(String(value ?? '').replace(/,/g, ''));
  return Number.isFinite(parsed) ? parsed : fallback;
}
