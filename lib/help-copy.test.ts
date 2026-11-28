import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { helpFaqs, helpGuides } from './help-content.ts';
import { akl } from './i18n/akl.ts';
import { en } from './i18n/en.ts';
import { hil } from './i18n/hil.ts';
import { mln } from './i18n/mln.ts';
import { tl } from './i18n/tl.ts';

const catalogs = { en, tl, hil, akl, mln };

describe('help wording', () => {
  it('spells out RVF, OTA, and MDR in the English FAQs', () => {
    const questions = en.faqs.map((faq) => faq.question).join(' ');
    const answers = en.faqs.map((faq) => faq.answer).join(' ');
    assert.match(questions, /RVF \(revolving fund\)/);
    assert.match(questions, /\bOTA\b/);
    assert.match(questions, /\bMDR\b/);
    assert.match(answers, /online travel agency/i);
    assert.match(answers, /Booking\.com/);
    assert.match(answers, /card fee/i);
    assert.match(answers, /merchant discount rate/i);
  });

  it('keeps the same FAQ count in every locale, with RVF spelled out', () => {
    assert.equal(en.faqs.length, 5);
    for (const [locale, catalog] of Object.entries(catalogs)) {
      assert.equal(catalog.faqs.length, en.faqs.length, locale);
      assert.match(catalog.faqs[2].question, /RVF \(revolving fund\)/);
      assert.match(catalog.faqs[3].question, /OTA/);
      assert.match(catalog.faqs[4].question, /MDR/);
    }
  });

  it('spells out OTA in the rates guide and RVF in the cash-sheet steps', () => {
    const rates = helpGuides.find((guide) => guide.id === 'rates');
    assert.ok(rates);
    assert.match(rates.summary, /online travel agency, like Booking\.com/);
    const close = helpGuides.find((guide) => guide.id === 'close');
    assert.ok(close);
    assert.match(close.steps.join(' '), /revolving fund \(RVF\)/);
    const enClose = en.guides.close.steps.join(' ');
    assert.match(enClose, /revolving fund \(RVF\)/);
    const questions = helpFaqs.map((faq) => faq.question).join(' ');
    assert.match(questions, /RVF \(revolving fund\)/);
    assert.match(questions, /\bOTA\b/);
    assert.match(questions, /\bMDR\b/);
  });

  it('uses Check in guest and Walk-in, not press Check in', () => {
    const today = helpGuides.find((guide) => guide.id === 'today');
    assert.ok(today);
    const steps = today.steps.join(' ');
    assert.match(steps, /Check in guest/);
    assert.match(steps, /Walk-in/);
    assert.doesNotMatch(steps, /press Check in/);
    const enToday = en.guides.today.steps.join(' ');
    assert.match(enToday, /Check in guest/);
    assert.match(enToday, /Walk-in/);
    assert.doesNotMatch(enToday, /press Check in/);
    for (const [locale, catalog] of Object.entries(catalogs)) {
      const localSteps = catalog.guides.today.steps.join(' ');
      assert.match(localSteps, /Walk-in/, `${locale} today guide should name Walk-in`);
      assert.doesNotMatch(localSteps, /press Check in/, locale);
    }
  });

  it('translates the cash sheet label instead of Close the day', () => {
    assert.equal(en.labels['today.close'], 'Daily cash sheet');
    assert.equal(en.labels['close.title'], 'Daily cash sheet');
    assert.equal(en.labels['nav.sales'], 'Daily cash sheet');
    assert.equal(en.labels['today.expense'], 'Add expense');
    for (const [locale, catalog] of Object.entries(catalogs)) {
      if (locale === 'en') continue;
      for (const key of ['today.close', 'close.title', 'nav.sales']) {
        const value = catalog.labels[key];
        assert.match(value, /cash sheet/i, `${locale} ${key}`);
        assert.doesNotMatch(value, /isara|isira|close the day|benta|baligya/i, `${locale} ${key}`);
      }
      assert.doesNotMatch(catalog.guides.close.title, /isara|isira/i, `${locale} close guide title`);
      assert.equal(catalog.labels['today.expense'], {
        tl: 'Magdagdag ng gastos',
        hil: 'Dugangi ang gasto',
        akl: 'Dugangi ro gasto',
        mln: 'Dugangan ro gasto'
      }[locale]);
    }
  });
});
