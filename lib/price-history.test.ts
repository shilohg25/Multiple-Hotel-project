import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  entriesFromChannelRateAudits,
  entriesFromPaymentChannelAudits,
  entriesFromPriceChangeLogs,
  formatHistoryValue,
  mergePriceHistory
} from './price-history.ts';

describe('price change history', () => {
  it('keeps room and service price log rows', () => {
    const rows = entriesFromPriceChangeLogs([
      {
        id: 'room-1',
        changed_type: 'room_price',
        old_value: 2500,
        new_value: 2800,
        notes: 'Room 101 base rate changed',
        created_at: '2026-11-23T10:00:00.000Z',
        rooms: { name: 'TEST- 101' },
        profiles: { full_name: 'TEST- Owner' }
      }
    ]);
    assert.equal(rows[0].changed_type, 'room price');
    assert.equal(rows[0].item_label, 'TEST- 101');
    assert.equal(rows[0].value_kind, 'money');
    assert.equal(rows[0].new_value, 2800);
  });

  it('turns payment-channel surcharge and MDR audits into history rows', () => {
    const rows = entriesFromPaymentChannelAudits([
      {
        id: 'audit-card',
        action: 'payment_channel.updated',
        created_at: '2026-11-23T11:00:00.000Z',
        profiles: { full_name: 'TEST- Manager' },
        details: {
          before: { name: 'Card (Metrobank swiper)', surcharge_percent: 3, mdr_percent: 3.5 },
          after: { name: 'Card (Metrobank swiper)', surcharge_percent: 4, mdr_percent: 3.5 }
        }
      }
    ]);
    assert.equal(rows.length, 1);
    assert.equal(rows[0].changed_type, 'payment channel');
    assert.equal(rows[0].item_label, 'Card (Metrobank swiper) · guest surcharge');
    assert.equal(rows[0].old_value, 3);
    assert.equal(rows[0].new_value, 4);
    assert.equal(rows[0].value_kind, 'percent');
    assert.equal(formatHistoryValue(rows[0].new_value, rows[0].value_kind, (value) => `₱${value}`), '4%');
  });

  it('lists walk-in and OTA channel rate changes when old rates were recorded', () => {
    const rows = entriesFromChannelRateAudits([
      {
        id: 'audit-rate',
        action: 'rate.channel_defaults_updated',
        created_at: '2026-11-23T12:00:00.000Z',
        profiles: { full_name: 'TEST- Owner' },
        details: {
          room_type: 'Deluxe King',
          before: { walk_in: 2500, ota: 2200, short_time: 1500 },
          rates: { walk_in: 2600, ota: 2200, short_time: 1500 }
        }
      }
    ]);
    assert.equal(rows.length, 1);
    assert.equal(rows[0].changed_type, 'channel rate');
    assert.equal(rows[0].item_label, 'Deluxe King · walk-in');
    assert.equal(rows[0].old_value, 2500);
    assert.equal(rows[0].new_value, 2600);
  });

  it('merges payment-channel rows into the same newest-first list as room prices', () => {
    const merged = mergePriceHistory([
      entriesFromPriceChangeLogs([
        {
          id: 'room-1',
          changed_type: 'room_price',
          old_value: 2500,
          new_value: 2800,
          created_at: '2026-11-23T10:00:00.000Z',
          rooms: { name: 'TEST- 101' },
          profiles: { full_name: 'TEST- Owner' }
        }
      ]),
      entriesFromPaymentChannelAudits([
        {
          id: 'audit-card',
          action: 'payment_channel.updated',
          created_at: '2026-11-23T11:00:00.000Z',
          profiles: { full_name: 'TEST- Manager' },
          details: {
            before: { name: 'Card', surcharge_percent: 3, mdr_percent: 3.5 },
            after: { name: 'Card', surcharge_percent: 3, mdr_percent: 4 }
          }
        }
      ])
    ]);
    assert.equal(merged[0].changed_type, 'payment channel');
    assert.equal(merged[0].item_label, 'Card · bank MDR');
    assert.equal(merged[1].changed_type, 'room price');
  });

  it('keeps thousandths on a payment-channel surcharge change so 3.001 to 3.002 is not a generic update', () => {
    const rows = entriesFromPaymentChannelAudits([
      {
        id: 'audit-milli',
        action: 'payment_channel.updated',
        created_at: '2026-11-23T11:30:00.000Z',
        profiles: { full_name: 'TEST- Manager' },
        details: {
          before: { name: 'Card (Metrobank swiper)', surcharge_percent: 3.001, mdr_percent: 3.5 },
          after: { name: 'Card (Metrobank swiper)', surcharge_percent: 3.002, mdr_percent: 3.5 }
        }
      }
    ]);
    assert.equal(rows.length, 1);
    assert.equal(rows[0].changed_type, 'payment channel');
    assert.equal(rows[0].item_label, 'Card (Metrobank swiper) · guest surcharge');
    assert.equal(rows[0].old_value, 3.001);
    assert.equal(rows[0].new_value, 3.002);
    assert.equal(rows[0].notes, null);
    assert.equal(formatHistoryValue(rows[0].old_value, 'percent', (value) => `₱${value}`), '3.001%');
    assert.equal(formatHistoryValue(rows[0].new_value, 'percent', (value) => `₱${value}`), '3.002%');
    assert.equal(formatHistoryValue(3.500, 'percent', (value) => `₱${value}`), '3.5%');
  });

  it('does not invent history rows for channel rates that were not in the submitted payload', () => {
    const rows = entriesFromChannelRateAudits([
      {
        id: 'audit-partial',
        action: 'rate.channel_defaults_updated',
        created_at: '2026-11-23T12:30:00.000Z',
        profiles: { full_name: 'TEST- Owner' },
        details: {
          room_type: 'Deluxe King',
          before: { walk_in: 2500, ota: 2200, short_time: 1500 },
          rates: { walk_in: 2600 }
        }
      }
    ]);
    assert.equal(rows.length, 1);
    assert.equal(rows[0].item_label, 'Deluxe King · walk-in');
    assert.equal(rows[0].old_value, 2500);
    assert.equal(rows[0].new_value, 2600);
    assert.equal(rows.some((row) => row.item_label.includes('ota') || row.item_label.includes('short-time')), false);
    assert.equal(rows.some((row) => row.new_value === null), false);
  });
});
