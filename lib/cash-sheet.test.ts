import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { CASH_DENOMINATIONS, closeFiguresFromCounts, figuresFromLedger, resolveReturnToFund, summarizeClose, type LedgerLike } from './day-close.ts';
import { SHEET_ENTRY_CATEGORIES, sheetBaseFigures, sheetCloseSummary, sheetInitialReturnToFund, splitSheetLedger, type SavedCloseRow, type SheetLedgerRow } from './cash-sheet.ts';

/*
 * FROZEN copy of the close path at origin/main f392e0c (lib/day-close.ts, app/api/day-closes/route.ts,
 * app/(protected)/today/close/page.tsx, components/DayCloseForm.tsx). Do not edit to make a test pass.
 * If the live helpers drift from this copy, the "live helpers still match" test fails.
 */
const legacy = (() => {
  const money = (value: number) => Math.round(Number(value || 0) * 100) / 100;
  type F = ReturnType<typeof figures>;
  function figures(rows: LedgerLike[], rvfFloat: number) {
    const b = { roomSales: 0, addonSales: 0, miscSales: 0, expenses: 0, collectibles: 0, gcash: 0, maya: 0, bank: 0, card: 0, cheque: 0, otherNonCash: 0, cashSales: 0, rvfFloat, floatCounted: 0, drawerCounted: 0, bankDeposit: 0, returnToFund: 0 };
    for (const row of rows) {
      const amount = Number(row.amount || 0);
      const category = String(row.category || '');
      const method = String(row.payment_method || '');
      const collectible = Boolean(row.is_collectible) || category === 'collectible';
      if (category === 'expense' || category === 'expenses') { b.expenses += amount; continue; }
      if (category === 'room' || category === 'room_payment') b.roomSales += amount;
      else if (category === 'add_on' || category === 'breakfast' || category === 'extra_bed') b.addonSales += amount;
      else b.miscSales += amount;
      if (collectible) { b.collectibles += amount; continue; }
      if (method === 'cash') b.cashSales += amount;
      else if (method === 'gcash') b.gcash += amount;
      else if (method === 'maya') b.maya += amount;
      else if (method === 'bank_transfer') b.bank += amount;
      else if (method === 'card') b.card += amount;
      else if (method === 'cheque') b.cheque += amount;
      else b.otherNonCash += amount;
    }
    b.returnToFund = b.expenses;
    return b;
  }
  const countTotal = (rows: { denomination: number; quantity: number }[]) => money(rows.reduce((s, r) => s + Number(r.denomination) * Number(r.quantity || 0), 0));
  function rtf(provided: number | null | undefined, expenses: number) {
    if (provided === null || provided === undefined || (typeof provided === 'number' && Number.isNaN(provided))) return money(expenses);
    const value = Number(provided);
    if (!Number.isFinite(value)) return money(expenses);
    return money(value);
  }
  function withCounts(base: F, o: { floatCounts: { denomination: number; quantity: number }[]; drawerCounts: { denomination: number; quantity: number }[]; bankDeposit: number | null | undefined; returnToFund: number | null | undefined }) {
    return { ...base, floatCounted: countTotal(o.floatCounts), drawerCounted: countTotal(o.drawerCounts), bankDeposit: money(Number(o.bankDeposit || 0)), returnToFund: rtf(o.returnToFund, base.expenses) };
  }
  function summarize(input: F) {
    const totalSales = money(input.roomSales + input.addonSales + input.miscSales);
    const nonCash = money(input.gcash + input.maya + input.bank + input.card + input.cheque + input.otherNonCash);
    const cashOnHand = money(totalSales - input.collectibles - nonCash);
    const expectedCash = money(cashOnHand - input.returnToFund);
    const expectedDrawer = money(input.rvfFloat + expectedCash);
    const countedDrawer = money(input.floatCounted + money(money(input.drawerCounted) + money(input.bankDeposit)));
    const variance = money(countedDrawer - expectedDrawer);
    const status = Math.abs(variance) < 0.009 ? 'balanced' : variance < 0 ? 'short' : 'excess';
    return { ...input, totalSales, nonCash, cashOnHand, expectedCash, expectedDrawer, countedDrawer, variance, status };
  }
  /** Old POST /api/day-closes: summary + the stored day_closes figures. */
  function serverSave(rows: LedgerLike[], rvf: number, payload: Payload) {
    const s = summarize(withCounts(figures(rows, rvf), {
      floatCounts: payload.float_counts.map((r) => ({ denomination: Number(r.denomination || 0), quantity: Number(r.quantity || 0) })),
      drawerCounts: payload.drawer_counts.map((r) => ({ denomination: Number(r.denomination || 0), quantity: Number(r.quantity || 0) })),
      bankDeposit: payload.bank_deposit,
      returnToFund: payload.return_to_fund
    }));
    return { summary: s, record: { rvf_float: s.rvfFloat, float_counted: s.floatCounted, drawer_counted: s.drawerCounted, bank_deposit: s.bankDeposit, return_to_fund: s.returnToFund, variance_amount: s.variance, variance_status: s.status } };
  }
  /** Old Close the day page + DayCloseForm: figures shown and the form's starting RTF. */
  function pageAndForm(rows: LedgerLike[], rvf: number, saved: SavedCloseRow, edits: { floatCounts: Record<number, number>; drawerCounts: Record<number, number>; bankDeposit?: number; returnToFund?: number }) {
    const f = figures(rows, rvf);
    if (saved) {
      f.floatCounted = Number(saved.float_counted || 0);
      f.drawerCounted = Number(saved.drawer_counted || 0);
      f.bankDeposit = Number(saved.bank_deposit || 0);
      f.returnToFund = Number(saved.return_to_fund ?? f.expenses);
    }
    const startRtf = rtf(saved?.return_to_fund as number | null | undefined, f.returnToFund);
    const startBank = Number(saved?.bank_deposit || 0);
    const toRows = (m: Record<number, number>) => Object.entries(m).map(([d, q]) => ({ denomination: Number(d), quantity: Number(q || 0) }));
    const preview = summarize(withCounts(f, { floatCounts: toRows(edits.floatCounts), drawerCounts: toRows(edits.drawerCounts), bankDeposit: edits.bankDeposit ?? startBank, returnToFund: edits.returnToFund ?? startRtf }));
    return { base: f, startRtf, startBank, preview };
  }
  return { figures, summarize, withCounts, rtf, serverSave, pageAndForm };
})();

type Payload = {
  bank_deposit: number;
  return_to_fund: number | null | undefined;
  float_counts: { denomination: number; quantity: number }[];
  drawer_counts: { denomination: number; quantity: number }[];
};

type Fixture = {
  name: string;
  rvf: number;
  rows: SheetLedgerRow[];
  saved: SavedCloseRow;
  floatCounts: Record<number, number>;
  drawerCounts: Record<number, number>;
  bankDeposit?: number;
  returnToFund?: number;
};

const stay = 'res-1';
const pay = (amount: number, method: string, reservation_id: string | null = stay): SheetLedgerRow => ({ category: 'room_payment', payment_method: method, is_collectible: false, amount, reservation_id });
const typed = (category: string, amount: number, method = 'cash', is_collectible = false): SheetLedgerRow => ({ category, payment_method: method, is_collectible, amount, reservation_id: null });
const fullFloat = { 1000: 10 };

const fixtures: Fixture[] = [
  { name: 'zero day, nothing counted', rvf: 10000, rows: [], saved: null, floatCounts: {}, drawerCounts: {} },
  { name: 'zero day, float only, balanced', rvf: 10000, rows: [], saved: null, floatCounts: fullFloat, drawerCounts: {} },
  { name: 'cash room payment only', rvf: 10000, rows: [pay(2500, 'cash')], saved: null, floatCounts: fullFloat, drawerCounts: { 1000: 2, 500: 1 } },
  {
    name: 'cash + non-cash channels (GCash, Maya, bank, card with MDR-sized amount, cheque, OTA)',
    rvf: 10000,
    rows: [pay(3950, 'cash'), pay(1700, 'gcash'), pay(800, 'maya'), pay(5000, 'bank_transfer'), pay(2317.5, 'card'), pay(1200, 'cheque'), pay(3000, 'booking_dot_com'), typed('other', 650, 'cash'), typed('add_on', 500, 'gcash')],
    saved: null,
    floatCounts: fullFloat,
    drawerCounts: { 1000: 3, 500: 3, 100: 1 }
  },
  {
    name: 'expenses default return-to-fund (cash short)',
    rvf: 10000,
    rows: [pay(3950, 'cash'), typed('expense', 1959, 'cash'), typed('room', 4770, 'cash', true)],
    saved: null,
    floatCounts: fullFloat,
    drawerCounts: { 1000: 1, 500: 1, 200: 2 },
    bankDeposit: 100
  },
  {
    name: '0 return-to-fund typed with expenses (stays 0, not reset to expenses)',
    rvf: 10000,
    rows: [pay(5000, 'cash'), typed('expenses', 1200, 'cash')],
    saved: null,
    floatCounts: fullFloat,
    drawerCounts: { 1000: 5 },
    returnToFund: 0
  },
  {
    name: 'saved close with 0 return-to-fund and a bank deposit reloads the same',
    rvf: 8000,
    rows: [pay(5000, 'cash'), typed('expense', 750, 'cash'), typed('collectible', 900, 'cash')],
    saved: { float_counted: 8000, drawer_counted: 3000, bank_deposit: 2000, return_to_fund: 0 },
    floatCounts: { 1000: 8 },
    drawerCounts: { 1000: 3 }
  },
  {
    name: 'saved close with null return-to-fund falls back to expenses',
    rvf: 10000,
    rows: [pay(4000, 'cash'), typed('expense', 400.25, 'cash')],
    saved: { float_counted: 10000, drawer_counted: 3600, bank_deposit: null, return_to_fund: null },
    floatCounts: fullFloat,
    drawerCounts: { 1000: 3, 500: 1, 100: 1 }
  },
  {
    name: 'refund as a negative cash row, breakfast and extra bed add-ons, excess drawer',
    rvf: 10000,
    rows: [pay(6000, 'cash'), pay(-1500, 'cash'), typed('breakfast', 500, 'cash'), typed('extra_bed', 800, 'gcash'), typed('deposit', 1000, 'cash')],
    saved: null,
    floatCounts: fullFloat,
    drawerCounts: { 1000: 6, 50: 1 }
  },
  {
    name: 'legacy typed room rows (no reservation) and typed room payments still count',
    rvf: 10000,
    rows: [typed('room', 2000, 'cash'), typed('room_payment', 1500, 'gcash'), pay(1000, 'cash')],
    saved: null,
    floatCounts: fullFloat,
    drawerCounts: { 1000: 3 }
  },
  {
    name: 'decimals and string amounts as Supabase returns numeric',
    rvf: 10000.5,
    rows: [{ ...pay(0, 'cash'), amount: '1234.56' }, { ...typed('expense', 0), amount: '99.99' }, { ...typed('other', 0, 'card'), amount: '10.01' }],
    saved: null,
    floatCounts: { 1000: 10, 1: 0 },
    drawerCounts: { 500: 2, 100: 1, 20: 1, 10: 1, 5: 1, 1: 4 },
    bankDeposit: 0.57,
    returnToFund: 99.99
  }
];

const storedKeys = ['rvf_float', 'float_counted', 'drawer_counted', 'bank_deposit', 'return_to_fund', 'variance_amount', 'variance_status'] as const;
const summaryKeys = ['roomSales', 'addonSales', 'miscSales', 'expenses', 'collectibles', 'gcash', 'maya', 'bank', 'card', 'cheque', 'otherNonCash', 'cashSales', 'rvfFloat', 'floatCounted', 'drawerCounted', 'bankDeposit', 'returnToFund', 'totalSales', 'nonCash', 'cashOnHand', 'expectedCash', 'expectedDrawer', 'countedDrawer', 'variance', 'status'] as const;

describe('one daily cash sheet: close figures equal the old path', () => {
  for (const fx of fixtures) {
    it(fx.name, () => {
      // Old path: Close the day page + form preview, then POST /api/day-closes with the form payload.
      const old = legacy.pageAndForm(fx.rows, fx.rvf, fx.saved, fx);
      const oldPayload: Payload = {
        bank_deposit: fx.bankDeposit ?? old.startBank,
        return_to_fund: fx.returnToFund ?? old.startRtf,
        float_counts: CASH_DENOMINATIONS.map((denomination) => ({ denomination, quantity: fx.floatCounts[denomination] || 0 })),
        drawer_counts: CASH_DENOMINATIONS.map((denomination) => ({ denomination, quantity: fx.drawerCounts[denomination] || 0 }))
      };
      const oldSave = legacy.serverSave(fx.rows, fx.rvf, oldPayload);

      // New sheet: rows are split for display, then put back together for the close.
      const split = splitSheetLedger(fx.rows);
      const sheetRows = [...split.typed, ...split.fromApp];
      const base = sheetBaseFigures(sheetRows, fx.rvf, fx.saved);
      const startRtf = sheetInitialReturnToFund(fx.saved, base);
      const startBank = Number(fx.saved?.bank_deposit || 0);
      const preview = sheetCloseSummary(base, { floatCounts: fx.floatCounts, drawerCounts: fx.drawerCounts, bankDeposit: fx.bankDeposit ?? startBank, returnToFund: fx.returnToFund ?? startRtf });
      const newPayload: Payload = {
        bank_deposit: fx.bankDeposit ?? startBank,
        return_to_fund: fx.returnToFund ?? startRtf,
        float_counts: CASH_DENOMINATIONS.map((denomination) => ({ denomination, quantity: fx.floatCounts[denomination] || 0 })),
        drawer_counts: CASH_DENOMINATIONS.map((denomination) => ({ denomination, quantity: fx.drawerCounts[denomination] || 0 }))
      };
      // The live, unchanged server pipeline (what POST /api/day-closes runs) on the sheet's payload.
      const liveSummary = summarizeClose(closeFiguresFromCounts(figuresFromLedger(sheetRows, fx.rvf), {
        floatCounts: newPayload.float_counts,
        drawerCounts: newPayload.drawer_counts,
        bankDeposit: newPayload.bank_deposit,
        returnToFund: newPayload.return_to_fund
      }));
      const newRecord = { rvf_float: liveSummary.rvfFloat, float_counted: liveSummary.floatCounted, drawer_counted: liveSummary.drawerCounted, bank_deposit: liveSummary.bankDeposit, return_to_fund: liveSummary.returnToFund, variance_amount: liveSummary.variance, variance_status: liveSummary.status };

      assert.deepEqual(newPayload, oldPayload, 'sheet sends the same payload');
      assert.deepEqual(base, old.base, 'same base figures on load');
      assert.equal(startRtf, old.startRtf, 'same starting return to fund');
      for (const key of summaryKeys) {
        assert.equal(preview[key], old.preview[key], `preview ${key}`);
        assert.equal(liveSummary[key], oldSave.summary[key], `saved summary ${key}`);
      }
      for (const key of storedKeys) assert.equal(newRecord[key], oldSave.record[key], `stored ${key}`);
      // The split is display-only: nothing lost or duplicated.
      assert.equal(split.fromApp.length + split.typed.length, fx.rows.length);
    });
  }

  it('live day-close helpers still match the frozen f392e0c copy', () => {
    for (const fx of fixtures) {
      const live = figuresFromLedger(fx.rows, fx.rvf);
      assert.deepEqual(live, legacy.figures(fx.rows, fx.rvf));
      for (const provided of [undefined, null, 0, 12.345, Number.NaN]) {
        assert.equal(resolveReturnToFund(provided, live.expenses), legacy.rtf(provided, live.expenses));
      }
    }
  });
});

describe('cash sheet display split', () => {
  it('puts confirmed room payments under "already in the app" and totals them by method', () => {
    const split = splitSheetLedger([pay(1000, 'cash'), pay(500, 'gcash'), pay(250, 'cash'), typed('expense', 100), typed('other', 300, 'card')]);
    assert.equal(split.fromApp.length, 3);
    assert.equal(split.typed.length, 2);
    assert.equal(split.fromAppTotal, 1750);
    assert.equal(split.typedTotal, 400);
    assert.deepEqual(split.fromAppByMethod, [{ method: 'cash', amount: 1250 }, { method: 'gcash', amount: 500 }]);
  });

  it('does not offer Room or Room payment to type (they come from confirmed payments)', () => {
    const values = SHEET_ENTRY_CATEGORIES.map((item) => item.value as string);
    assert.ok(!values.includes('room'));
    assert.ok(!values.includes('room_payment'));
    assert.ok(values.includes('expense'));
    assert.ok(values.includes('collectible'));
  });
});
