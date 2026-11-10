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
