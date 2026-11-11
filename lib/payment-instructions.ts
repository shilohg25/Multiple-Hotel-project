import { NAVARRO_SLUG, TAGOSILANGAN_SLUG } from './hotel-pricing.ts';

export type HotelPaymentAccount = {
  gcash: { name: string; number: string } | null;
  bankName: string;
  bankAccountName: string;
  bankAccountFullName: string | null;
  bankAccountNumber: string;
  placeholder: boolean;
};

const PLACEHOLDER: HotelPaymentAccount = {
  gcash: { name: 'PLACEHOLDER account name', number: 'PLACEHOLDER 09XX XXX XXXX' },
  bankName: 'PLACEHOLDER bank name',
  bankAccountName: 'PLACEHOLDER account name',
  bankAccountFullName: null,
  bankAccountNumber: 'PLACEHOLDER account number',
  placeholder: true
};

const ACCOUNTS: Record<string, HotelPaymentAccount> = {
  [TAGOSILANGAN_SLUG]: {
    gcash: { name: 'Ezra Gelito', number: '09691506919' },
    bankName: 'Metrobank',
    bankAccountName: 'Tagosilangan Beach House',
    bankAccountFullName: null,
    bankAccountNumber: '128-7-12856069-2',
    placeholder: false
  },
  [NAVARRO_SLUG]: {
    gcash: null,
    bankName: 'Metrobank',
    bankAccountName: 'NAVSOT CORP',
    bankAccountFullName: 'Navsot Corp DBA Navarro Hotel And Sotera Cafe And Restaurant',
    bankAccountNumber: '571-7-57102073-0',
    placeholder: false
  }
};

export function paymentAccountForHotel(hotel: { slug?: string | null }): HotelPaymentAccount {
  const slug = String(hotel.slug || '').trim().toLowerCase();
  return ACCOUNTS[slug] || PLACEHOLDER;
}

export function paymentInstructionLines(hotel: { slug?: string | null }): string[] {
  const account = paymentAccountForHotel(hotel);
  const lines: string[] = [];
  if (account.placeholder) lines.push('Payment instructions (PLACEHOLDER — not a real account)');
  if (account.gcash) lines.push(`GCash: ${account.gcash.name}, ${account.gcash.number}`);
  lines.push(`${account.bankName}: ${account.bankAccountName}, ${account.bankAccountNumber}`);
  if (account.bankAccountFullName) lines.push(account.bankAccountFullName);
  return lines;
}

/** @deprecated Use paymentAccountForHotel. Kept so older imports still compile. */
export const PAYMENT_INSTRUCTIONS = {
  labelledPlaceholder: true,
  gcashName: PLACEHOLDER.gcash?.name || '',
  gcashNumber: PLACEHOLDER.gcash?.number || '',
  bankName: PLACEHOLDER.bankName,
  bankAccountName: PLACEHOLDER.bankAccountName,
  bankAccountNumber: PLACEHOLDER.bankAccountNumber
} as const;
