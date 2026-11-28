export const CASH_DENOMINATIONS = [1000, 500, 200, 100, 50, 20, 10, 5, 1];

export type CloseFigures = {
  roomSales: number;
  addonSales: number;
  miscSales: number;
  expenses: number;
  collectibles: number;
  gcash: number;
  maya: number;
  bank: number;
  card: number;
  cheque: number;
  otherNonCash: number;
  cashSales: number;
  rvfFloat: number;
  floatCounted: number;
  drawerCounted: number;
  bankDeposit: number;
  returnToFund: number;
};

export type CloseSummary = CloseFigures & {
  totalSales: number;
  nonCash: number;
  cashOnHand: number;
  expectedCash: number;
  expectedDrawer: number;
  countedDrawer: number;
  variance: number;
  status: 'balanced' | 'short' | 'excess';
};

function money(value: number) {
  return Math.round(Number(value || 0) * 100) / 100;
}

/** Cash still in the drawer plus money already taken to the bank. These are different piles. */
export function cashOnHandCounted(drawerCounted: number, bankDeposit: number) {
  return money(money(drawerCounted) + money(bankDeposit));
}

export function summarizeClose(input: CloseFigures): CloseSummary {
  const totalSales = money(input.roomSales + input.addonSales + input.miscSales);
  const nonCash = money(input.gcash + input.maya + input.bank + input.card + input.cheque + input.otherNonCash);
  const cashOnHand = money(totalSales - input.collectibles - nonCash);
  const expectedCash = money(cashOnHand - input.returnToFund);
  const expectedDrawer = money(input.rvfFloat + expectedCash);
  const countedDrawer = money(input.floatCounted + cashOnHandCounted(input.drawerCounted, input.bankDeposit));
  const variance = money(countedDrawer - expectedDrawer);
  const status = Math.abs(variance) < 0.009 ? 'balanced' : variance < 0 ? 'short' : 'excess';
  return {
    ...input,
    totalSales,
    nonCash,
    cashOnHand,
    expectedCash,
    expectedDrawer,
    countedDrawer,
    variance,
    status
  };
}

export type LedgerLike = {
  category?: string | null;
  payment_method?: string | null;
  is_collectible?: boolean;
  amount?: number | string | null;
};

export function figuresFromLedger(rows: LedgerLike[], rvfFloat: number): CloseFigures {
  const blank: CloseFigures = {
    roomSales: 0,
    addonSales: 0,
    miscSales: 0,
    expenses: 0,
    collectibles: 0,
    gcash: 0,
    maya: 0,
    bank: 0,
    card: 0,
    cheque: 0,
    otherNonCash: 0,
    cashSales: 0,
    rvfFloat,
    floatCounted: 0,
    drawerCounted: 0,
    bankDeposit: 0,
    returnToFund: 0
  };
  for (const row of rows) {
    const amount = Number(row.amount || 0);
    const category = String(row.category || '');
    const method = String(row.payment_method || '');
    const collectible = Boolean(row.is_collectible) || category === 'collectible';
    if (category === 'expense' || category === 'expenses') {
      blank.expenses += amount;
      continue;
    }
    if (category === 'room' || category === 'room_payment') blank.roomSales += amount;
    else if (category === 'add_on' || category === 'breakfast' || category === 'extra_bed') blank.addonSales += amount;
    else blank.miscSales += amount;
    if (collectible) {
      blank.collectibles += amount;
      continue;
    }
    if (method === 'cash') blank.cashSales += amount;
    else if (method === 'gcash') blank.gcash += amount;
    else if (method === 'maya') blank.maya += amount;
    else if (method === 'bank_transfer') blank.bank += amount;
    else if (method === 'card') blank.card += amount;
    else if (method === 'cheque') blank.cheque += amount;
    else blank.otherNonCash += amount;
  }
  blank.returnToFund = blank.expenses;
  return blank;
}

export function countTotal(rows: { denomination: number; quantity: number }[]): number {
  return money(rows.reduce((sum, row) => sum + Number(row.denomination) * Number(row.quantity || 0), 0));
}

export function resolveReturnToFund(provided: number | null | undefined, expenses: number) {
  if (provided === null || provided === undefined || (typeof provided === 'number' && Number.isNaN(provided))) {
    return money(expenses);
  }
  const value = Number(provided);
  if (!Number.isFinite(value)) return money(expenses);
  return money(value);
}

export type CountBucket = 'float' | 'drawer';

export type SavedCountRow = {
  bucket: string;
  denomination: number | string;
  quantity: number | string;
};

function quantityEntered(counts: Record<number, number> | { quantity?: number | string | null; denomination?: number | string | null }[]): boolean {
  const values = Array.isArray(counts)
    ? counts.map((row) => Number(row.quantity || 0))
    : Object.values(counts).map((value) => Number(value || 0));
  return values.some((value) => Number.isFinite(value) && value > 0);
}

/**
 * Display-only: true once staff have entered a cash count (any float or drawer
 * quantity, or money already deposited). Return-to-fund is not a count.
 * Close math is unchanged and can still score a short of an empty drawer.
 */
export function hasCashBeenCounted(
  floatCounts: Record<number, number> | { quantity?: number | string | null; denomination?: number | string | null }[],
  drawerCounts: Record<number, number> | { quantity?: number | string | null; denomination?: number | string | null }[],
  bankDeposit?: number | string | null
): boolean {
  return quantityEntered(floatCounts) || quantityEntered(drawerCounts) || Number(bankDeposit || 0) > 0;
}

/**
 * Display-only: a saved close always shows its stored Short/Excess/Balanced,
 * even when every count is still zero. Unsaved empty counts stay "Not counted yet".
 */
export function shouldShowCloseVariance(
  savedClose: unknown,
  floatCounts: Record<number, number> | { quantity?: number | string | null; denomination?: number | string | null }[],
  drawerCounts: Record<number, number> | { quantity?: number | string | null; denomination?: number | string | null }[],
  bankDeposit?: number | string | null
): boolean {
  return Boolean(savedClose) || hasCashBeenCounted(floatCounts, drawerCounts, bankDeposit);
}

/** Rebuild the denomination map the close form needs from saved day_close_counts rows. */
export function countMapForBucket(rows: SavedCountRow[], bucket: CountBucket): Record<number, number> {
  const map: Record<number, number> = {};
  for (const row of rows) {
    if (row.bucket !== bucket) continue;
    const denomination = Number(row.denomination);
    const quantity = Number(row.quantity || 0);
    if (Number.isFinite(denomination) && denomination > 0 && Number.isFinite(quantity)) {
      map[denomination] = quantity;
    }
  }
  return map;
}

export function countRowsFromMap(counts: Record<number, number>): { denomination: number; quantity: number }[] {
  return Object.entries(counts).map(([denomination, quantity]) => ({
    denomination: Number(denomination),
    quantity: Number(quantity || 0)
  }));
}

/** Shared input for the close preview and the server save path. */
export function closeFiguresFromCounts(
  base: CloseFigures,
  options: {
    floatCounts: { denomination: number; quantity: number }[];
    drawerCounts: { denomination: number; quantity: number }[];
    bankDeposit: number | null | undefined;
    returnToFund: number | null | undefined;
  }
): CloseFigures {
  return {
    ...base,
    floatCounted: countTotal(options.floatCounts),
    drawerCounted: countTotal(options.drawerCounts),
    bankDeposit: money(Number(options.bankDeposit || 0)),
    returnToFund: resolveReturnToFund(options.returnToFund, base.expenses)
  };
}

/** Keep 0 visible in a controlled number input. `value || ''` would show a blank. */
export function formNumberValue(value: number | null | undefined): number | '' {
  return value ?? '';
}

