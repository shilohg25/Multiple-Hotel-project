import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { akl } from './i18n/akl.ts';
import { en } from './i18n/en.ts';
import { hil } from './i18n/hil.ts';
import { mln } from './i18n/mln.ts';
import { tl } from './i18n/tl.ts';
import { todayCashSheetHref, todayExpenseHref, todayWalkInHref, TODAY_EXPENSE_HASH } from './today-wording.ts';

const catalogs = [en, tl, hil, akl, mln];

describe('today wording links', () => {
  it('sends Walk-in to the new reservation form, not to an arrival check-in', () => {
    assert.equal(todayWalkInHref(), '/reservations/new');
  });

  it('keeps Daily cash sheet on the close page with no hash', () => {
    assert.equal(todayCashSheetHref('hotel=h1&date=2026-11-28'), '/today/close?hotel=h1&date=2026-11-28');
    assert.equal(todayCashSheetHref(''), '/today/close');
  });

  it('sends Add expense to the expense section of the same cash sheet', () => {
    const href = todayExpenseHref('hotel=h1&date=2026-11-28&outlet=o1');
    assert.equal(href, '/today/close?hotel=h1&date=2026-11-28&outlet=o1#expense');
    assert.equal(TODAY_EXPENSE_HASH, 'expense');
    assert.notEqual(href, todayCashSheetHref('hotel=h1&date=2026-11-28&outlet=o1'));
  });
});

describe('today wording labels', () => {
  it('gives arrivals and the new-stay button distinct labels in every locale', () => {
    assert.equal(en.labels['today.checkIn'], 'Check in guest');
    assert.equal(en.labels['today.walkIn'], 'Walk-in');
    for (const catalog of catalogs) {
      assert.equal(Boolean(catalog.labels['today.checkIn']), true);
      assert.equal(Boolean(catalog.labels['today.walkIn']), true);
      assert.notEqual(catalog.labels['today.checkIn'], catalog.labels['today.walkIn']);
    }
  });

  it('does not rename Daily cash sheet or Save cash sheet to the old video wording', () => {
    assert.equal(en.labels['today.close'], 'Daily cash sheet');
    assert.equal(en.labels['today.expense'], 'Add expense');
    assert.notEqual(en.labels['today.close'], 'Daily sales');
    assert.notEqual(en.labels['today.close'], 'Close the day');
    assert.notEqual(en.labels['today.close'], 'Save draft');
  });
});
