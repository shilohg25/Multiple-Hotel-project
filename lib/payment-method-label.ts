const labels: Record<string, string> = {
  gcash: 'GCash',
  maya: 'Maya',
  bank_transfer: 'Bank transfer',
  cash: 'Cash',
  card: 'Card',
  cheque: 'Cheque',
  other: 'Other'
};

export function paymentMethodLabel(method: string | null | undefined): string {
  const key = String(method || '');
  return labels[key] || key.replaceAll('_', ' ');
}
