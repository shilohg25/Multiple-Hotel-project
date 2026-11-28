import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { akl } from './i18n/akl.ts';
import { en } from './i18n/en.ts';
import { hil } from './i18n/hil.ts';
import { mln } from './i18n/mln.ts';
import { tl } from './i18n/tl.ts';
import {
  EMPTY_HOTEL_MESSAGE_EN,
  EMPTY_HOTEL_MESSAGE_KEY,
  EMPTY_HOTEL_MESSAGE_OWNER_EN,
  EMPTY_HOTEL_MESSAGE_OWNER_KEY,
  emptyHotelMessageKey,
  shouldShowHotelActionLinks,
  shouldShowOwnerControlsHeading,
  shouldShowOwnerPanel
} from './empty-hotel.ts';

const catalogs = { en, tl, hil, akl, mln };

describe('empty hotel copy', () => {
  it('uses one English message that asks a manager, not staff to create a hotel', () => {
    assert.equal(en.labels[EMPTY_HOTEL_MESSAGE_KEY], EMPTY_HOTEL_MESSAGE_EN);
    assert.match(EMPTY_HOTEL_MESSAGE_EN, /ask a manager/i);
    assert.doesNotMatch(EMPTY_HOTEL_MESSAGE_EN, /create a hotel/i);
    assert.doesNotMatch(EMPTY_HOTEL_MESSAGE_EN, /add a property/i);
  });

  it('has the same key in every locale catalog', () => {
    for (const [locale, catalog] of Object.entries(catalogs)) {
      const text = catalog.labels[EMPTY_HOTEL_MESSAGE_KEY];
      assert.ok(text, `${locale} is missing ${EMPTY_HOTEL_MESSAGE_KEY}`);
      assert.match(text, /manager/i, `${locale} should mention a manager`);
    }
  });

  it('gives owners a different empty message that does not tell them to ask a manager', () => {
    assert.equal(en.labels[EMPTY_HOTEL_MESSAGE_OWNER_KEY], EMPTY_HOTEL_MESSAGE_OWNER_EN);
    assert.match(EMPTY_HOTEL_MESSAGE_OWNER_EN, /add a hotel/i);
    assert.doesNotMatch(EMPTY_HOTEL_MESSAGE_OWNER_EN, /ask a manager/i);
    assert.equal(emptyHotelMessageKey('owner'), EMPTY_HOTEL_MESSAGE_OWNER_KEY);
    for (const role of ['manager', 'front_desk', 'cashier', 'restaurant_staff', 'restaurant', null]) {
      assert.equal(emptyHotelMessageKey(role), EMPTY_HOTEL_MESSAGE_KEY, String(role));
    }
    for (const [locale, catalog] of Object.entries(catalogs)) {
      const text = catalog.labels[EMPTY_HOTEL_MESSAGE_OWNER_KEY];
      assert.ok(text, `${locale} is missing ${EMPTY_HOTEL_MESSAGE_OWNER_KEY}`);
      assert.doesNotMatch(text, /ask a manager/i, `${locale} owner copy should not say ask a manager`);
    }
  });
});

describe('empty hotel actions', () => {
  it('hides New reservation and Public booking page when there are 0 hotels', () => {
    assert.equal(shouldShowHotelActionLinks(0), false);
    assert.equal(shouldShowHotelActionLinks(1), true);
    assert.equal(shouldShowHotelActionLinks(2), true);
  });

  it('shows the owner panel and Owner controls heading only to owners', () => {
    assert.equal(shouldShowOwnerPanel('owner'), true);
    assert.equal(shouldShowOwnerControlsHeading('owner'), true);
    for (const role of ['manager', 'front_desk', 'cashier', 'restaurant']) {
      assert.equal(shouldShowOwnerPanel(role), false, role);
      assert.equal(shouldShowOwnerControlsHeading(role), false, role);
    }
  });
});
