export type CashLedgerRow = {
  payment_method: string;
  is_collectible: boolean;
  amount: number | string | null;
  category?: string | null;
};

/**
 * Expected drawer cash for the daily report.
 * Confirming a payment already writes a ledger row, so confirmed payment totals
 * must not be added again. Non-cash methods and collectibles are not expected cash.
 */
export function expectedCashFromLedger(entries: CashLedgerRow[]): number {
  return entries.reduce((sum, entry) => {
    if (entry.payment_method !== 'cash' || entry.is_collectible) return sum;
    return sum + Number(entry.amount || 0);
  }, 0);
}
