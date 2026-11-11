import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { statusChangeReason } from './status-reason.ts';

describe('check-in reason', () => {
  it('uses the reason typed on the page', () => {
    assert.deepEqual(statusChangeReason('Guest arrived early', null), { ok: true, reason: 'Guest arrived early' });
  });

  it('uses the dialog prompt when the page box is empty', () => {
    assert.deepEqual(statusChangeReason('  ', 'Flight landed early'), { ok: true, reason: 'Flight landed early' });
  });

  it('stays off when the prompt is cancelled or blank', () => {
    assert.deepEqual(statusChangeReason('', null), { ok: false });
    assert.deepEqual(statusChangeReason('', '   '), { ok: false });
  });
});
