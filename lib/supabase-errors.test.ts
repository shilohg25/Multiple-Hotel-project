import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { unavailableDatabaseFunction } from './supabase-errors.ts';

describe('unavailable database function', () => {
  it('explains a missing confirm function instead of failing closed', () => {
    const message = unavailableDatabaseFunction({
      code: 'PGRST202',
      message: 'Could not find the function public.confirm_submitted_payment in the schema cache'
    });
    assert.match(message || '', /confirm_submitted_payment/);
    assert.match(message || '', /not available yet/);
  });

  it('leaves a normal error alone', () => {
    assert.equal(unavailableDatabaseFunction({ message: 'Payment is not awaiting confirmation.' }), null);
  });
});
