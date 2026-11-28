import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { akl } from './akl.ts';
import { en } from './en.ts';
import { hil } from './hil.ts';
import { mln } from './mln.ts';
import { tl } from './tl.ts';

function label(locale: 'en' | 'tl' | 'hil' | 'akl' | 'mln', key: string) {
  const catalogs = { en, tl, hil, akl, mln };
  return catalogs[locale].labels[key] || en.labels[key] || key;
}

describe('translations', () => {
  it('uses English when a translation is missing', () => {
    assert.equal(label('tl', 'not-translated-yet'), 'not-translated-yet');
    assert.equal(label('akl', 'today.title'), akl.labels['today.title']);
    const sparse = { ...tl.labels };
    delete sparse['close.print'];
    assert.equal(sparse['close.print'] || en.labels['close.print'], 'Print');
  });

  it('marks every non-English catalog as needing review', () => {
    assert.equal(en.needsReview, false);
    assert.equal(tl.needsReview && hil.needsReview && akl.needsReview && mln.needsReview, true);
  });
});

const paymentKeys = [
  'payment.leadCash',
  'payment.leadOther',
  'payment.notes',
  'payment.proof',
  'payment.optional',
  'payment.noPhoto',
  'payment.noPhotoCash',
  'payment.proofUploaded',
  'payment.submit',
  'payment.submitCash',
  'payment.listLead'
] as const;

describe('payment proof copy', () => {
  it('has the cash-and-other-method strings in every locale', () => {
    const catalogs = { en, tl, hil, akl, mln };
    for (const locale of Object.keys(catalogs) as Array<keyof typeof catalogs>) {
      for (const key of paymentKeys) {
        const value = catalogs[locale].labels[key];
        assert.equal(typeof value, 'string', `${locale} ${key}`);
        assert.ok(value.length > 0, `${locale} ${key} is empty`);
      }
      assert.match(catalogs[locale].labels['payment.leadCash'], /cash/i);
    }
  });
});

