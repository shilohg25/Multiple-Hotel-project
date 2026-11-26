import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  TEST_HOTEL_NAME_ILIKE,
  PUBLIC_TEST_HOTEL_REFUSAL,
  excludeTestHotelNames,
  isTestHotel,
  publicHotelNotFound,
  publicVisibleHotels,
  refusePublicTestHotel
} from './test-hotel.ts';

describe('isTestHotel', () => {
  it('is true when the trimmed name starts with TEST-, case-insensitive', () => {
    for (const name of ['TEST- Practice Hotel', 'test- practice hotel', 'Test-Resort', '  TEST- Practice Hotel  ', 'TEST-']) {
      assert.equal(isTestHotel(name), true, String(name));
    }
  });

  it('is false for a normal hotel and near-miss names', () => {
    for (const name of ['Navarro Hotel', 'Tagosilangan Beach Hotel', 'Hotel TEST-Wing', 'TEST Practice', 'TESTed', '', '  ', null, undefined]) {
      assert.equal(isTestHotel(name), false, String(name));
    }
  });
});

describe('public hotel listing filter', () => {
  it('drops TEST- hotels from a public listing and keeps a normal hotel', () => {
    const hotels = [
      { slug: 'navarro-hotel', name: 'Navarro Hotel' },
      { slug: 'test-practice-hotel', name: 'TEST- Practice Hotel' },
      { slug: 'test-lower', name: 'test- lower' },
      { slug: 'padded', name: '  TEST- Padded  ' }
    ];
    assert.deepEqual(
      publicVisibleHotels(hotels).map((hotel) => hotel.slug),
      ['navarro-hotel']
    );
  });
});

describe('direct public URL 404', () => {
  it('404s a TEST- hotel slug and leaves a normal hotel visible', () => {
    assert.equal(publicHotelNotFound({ name: 'TEST- Practice Hotel', slug: 'test-practice-hotel' }), true);
    assert.equal(publicHotelNotFound({ name: '  test- practice hotel  ' }), true);
    assert.equal(publicHotelNotFound({ name: 'Navarro Hotel', slug: 'navarro-hotel' }), false);
    assert.equal(publicHotelNotFound(null), true);
    assert.equal(publicHotelNotFound(undefined), true);
  });
});

describe('public quote and booking refusal', () => {
  it('refuses a TEST- hotel and allows a normal hotel', () => {
    assert.equal(refusePublicTestHotel('TEST- Practice Hotel'), PUBLIC_TEST_HOTEL_REFUSAL);
    assert.equal(refusePublicTestHotel('  test- demo resort  '), PUBLIC_TEST_HOTEL_REFUSAL);
    assert.equal(refusePublicTestHotel('Navarro Hotel'), null);
    assert.equal(refusePublicTestHotel('Tagosilangan Beach Hotel'), null);
  });
});

describe('excludeTestHotelNames query filter', () => {
  it('adds a case-insensitive name prefix filter that callers pair with isTestHotel', () => {
    const calls: Array<[string, string, string]> = [];
    const filtered = excludeTestHotelNames({
      not(column: string, operator: string, value: string) {
        calls.push([column, operator, value]);
        return { tagged: true, column, operator, value };
      }
    });
    assert.deepEqual(calls, [['name', 'ilike', TEST_HOTEL_NAME_ILIKE]]);
    assert.equal(TEST_HOTEL_NAME_ILIKE, 'TEST-%');
    assert.equal((filtered as { tagged: boolean }).tagged, true);
  });
});
