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

export function summarizeClose(input: CloseFigures): CloseSummary {
  const totalSales = money(input.roomSales + input.addonSales + input.miscSales);
  const nonCash = money(input.gcash + input.maya + input.bank + input.card + input.cheque + input.otherNonCash);
  const cashOnHand = money(totalSales - input.collectibles - nonCash);
  const expectedCash = money(cashOnHand - input.returnToFund);
  const expectedDrawer = money(input.rvfFloat + expectedCash);
  const countedDrawer = money(input.floatCounted + input.drawerCounted + input.bankDeposit);
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
