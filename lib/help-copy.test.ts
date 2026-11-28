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
});
