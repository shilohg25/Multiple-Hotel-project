import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { channelRate, stayTotal } from './channel-rates.ts';

describe('channel rates', () => {
  it('keeps walk-in and OTA rates apart', () => {
    const rates = [
      { channel: 'walk_in', rate: 2250 },
      { channel: 'ota', rate: 2520 }
    ];
    assert.equal(channelRate(rates, 'walk_in'), 2250);
    assert.equal(channelRate(rates, 'ota'), 2520);
    assert.equal(channelRate(rates, 'short_time'), null);
  });

  it('prices a stay from the approved nightly rate', () => {
    assert.equal(stayTotal(2250, 2, 200), 4700);
  });
});