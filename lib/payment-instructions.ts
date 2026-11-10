/**
 * No GCash number or bank account is stored in this repo.
 * Replace every PLACEHOLDER before guests rely on these instructions.
 */
export const PAYMENT_INSTRUCTIONS = {
  labelledPlaceholder: true,
  gcashName: 'PLACEHOLDER account name',
  gcashNumber: 'PLACEHOLDER 09XX XXX XXXX',
  bankName: 'PLACEHOLDER bank name',
  bankAccountName: 'PLACEHOLDER account name',
  bankAccountNumber: 'PLACEHOLDER account number'
} as const;

export const PAYMENT_INSTRUCTION_FIELDS_NEEDED = [
  'GCash account name',
  'GCash mobile number',
  'Bank name',
  'Bank account name',
  'Bank account number'
] as const;
