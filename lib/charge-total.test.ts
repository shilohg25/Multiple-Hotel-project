import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  GENERATED_COLUMN_SQLSTATE,
  isGeneratedTotalAmountError,
  retryPayloadWithoutTotalAmount,
  withoutTotalAmount
} from './charge-total.ts';

const updatePayload = {
  service_item_id: 'svc-1',
  description: 'Airport drop-off',
  category: 'transport',
  quantity: 1,
  unit_price: 150,
  total_amount: 150,
  remittance_required: false,
  notes: 'TEST- patch'
};

describe('generated total_amount errors', () => {
  it('matches the Postgres UPDATE message that previously leaked as HTTP 400', () => {
    assert.equal(
      isGeneratedTotalAmountError({
        message: 'column "total_amount" can only be updated to DEFAULT'
      }),
      true
    );
  });

  it('matches Postgres SQLSTATE 428C9 even when the message is wrapped', () => {
    assert.equal(
      isGeneratedTotalAmountError({
        code: GENERATED_COLUMN_SQLSTATE,
        message: 'ERROR:  428C9: column "total_amount" can only be updated to DEFAULT'
      }),
      true
    );
    assert.equal(isGeneratedTotalAmountError({ code: '428c9', message: 'generated column write rejected' }), true);
  });

  it('still matches the INSERT wording and a generic generated-column message', () => {
    assert.equal(
      isGeneratedTotalAmountError({
        message: 'cannot insert a non-DEFAULT value into column "total_amount"'
      }),
      true
    );
    assert.equal(
      isGeneratedTotalAmountError({ message: 'cannot write to a generated column' }),
      true
    );
  });

  it('leaves ordinary charge write errors alone', () => {
    assert.equal(isGeneratedTotalAmountError(null), false);
    assert.equal(isGeneratedTotalAmountError({ message: 'new row for relation "reservation_charges" violates row-level security policy' }), false);
    assert.equal(isGeneratedTotalAmountError({ message: 'duplicate key value violates unique constraint', code: '23505' }), false);
    assert.equal(isGeneratedTotalAmountError({ message: 'Failed to update charge.' }), false);
    assert.equal(isGeneratedTotalAmountError({ message: 'column "description" is not nullable', code: '23502' }), false);
  });
});

describe('charge update payload retry', () => {
  it('omits total_amount and keeps quantity, unit_price, and the rest of the row', () => {
    assert.deepEqual(withoutTotalAmount(updatePayload), {
      service_item_id: 'svc-1',
      description: 'Airport drop-off',
      category: 'transport',
      quantity: 1,
      unit_price: 150,
      remittance_required: false,
      notes: 'TEST- patch'
    });
  });

  it('retries without total_amount for a manager unit_price PATCH after the UPDATE generated-column error', () => {
    const retry = retryPayloadWithoutTotalAmount(updatePayload, {
      message: 'column "total_amount" can only be updated to DEFAULT',
      code: '428C9'
    });
    assert.ok(retry);
    assert.equal(Object.prototype.hasOwnProperty.call(retry, 'total_amount'), false);
    assert.equal(retry.unit_price, 150);
    assert.equal(retry.quantity, 1);
    assert.equal(retry.description, 'Airport drop-off');
  });

  it('does not retry when the first error is unrelated, or when total_amount was already omitted', () => {
    assert.equal(
      retryPayloadWithoutTotalAmount(updatePayload, { message: 'Hotel access denied.' }),
      null
    );
    const alreadyOmitted = withoutTotalAmount(updatePayload);
    assert.equal(
      retryPayloadWithoutTotalAmount(alreadyOmitted, {
        message: 'column "total_amount" can only be updated to DEFAULT'
      }),
      null
    );
  });
});
