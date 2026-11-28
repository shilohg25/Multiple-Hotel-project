import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  PAYMENT_NOTES_REQUIRED,
  PAYMENT_PROOF_REQUIRED,
  STAFF_NO_PROOF_PATH,
  WALK_IN_DESK_CASH_PROOF_PATH,
  hasProofFile,
  NO_PHOTO_CASH_LABEL,
  isSentinelProofPath,
  proofFileRequired,
  receiptProofReference,
  storedProofPath,
  validatePaymentProofInput
} from './payment-proof.ts';

const METHODS_REQUIRING_PHOTO = [
  'gcash',
  'maya',
  'bank_transfer',
  'card',
  'cheque',
  'online_gateway',
  'booking_dot_com',
  'trip_dot_com',
  'other',
  '',
  'unknown'
];

describe('payment proof rules', () => {
  it('requires a note for cash, but not a photo', () => {
    assert.equal(proofFileRequired('cash'), false);
    assert.equal(proofFileRequired('CASH'), false);
    assert.deepEqual(
      validatePaymentProofInput({ method: 'cash', paymentDetails: 'Counted at the desk', hasProof: false }),
      { ok: true }
    );
    assert.deepEqual(
      validatePaymentProofInput({ method: 'cash', paymentDetails: '  Counted at the desk  ', hasProof: false }),
      { ok: true }
    );
    const missingNotes = validatePaymentProofInput({ method: 'cash', paymentDetails: '   ', hasProof: false });
    assert.deepEqual(missingNotes, { ok: false, error: PAYMENT_NOTES_REQUIRED });
    const missingNotesWithPhoto = validatePaymentProofInput({ method: 'cash', paymentDetails: '', hasProof: true });
    assert.deepEqual(missingNotesWithPhoto, { ok: false, error: PAYMENT_NOTES_REQUIRED });
  });

  it('accepts cash with both a note and a photo', () => {
    assert.deepEqual(
      validatePaymentProofInput({ method: 'cash', paymentDetails: 'Drawer count photo attached', hasProof: true }),
      { ok: true }
    );
  });

  for (const method of METHODS_REQUIRING_PHOTO) {
    it(`requires a note and a photo for ${method || 'a missing method'}`, () => {
      assert.equal(proofFileRequired(method), true);
      assert.deepEqual(
        validatePaymentProofInput({ method, paymentDetails: 'Ref 123', hasProof: true }),
        { ok: true }
      );
      assert.deepEqual(
        validatePaymentProofInput({ method, paymentDetails: 'Ref 123', hasProof: false }),
        { ok: false, error: PAYMENT_PROOF_REQUIRED }
      );
      assert.deepEqual(
        validatePaymentProofInput({ method, paymentDetails: '', hasProof: true }),
        { ok: false, error: PAYMENT_NOTES_REQUIRED }
      );
      assert.deepEqual(
        validatePaymentProofInput({ method, paymentDetails: '   ', hasProof: false }),
        { ok: false, error: PAYMENT_NOTES_REQUIRED }
      );
    });
  }

  it('stores cash without a photo under the existing staff sentinel, not a blank path', () => {
    assert.equal(storedProofPath({ method: 'cash' }), STAFF_NO_PROOF_PATH);
    assert.equal(storedProofPath({ method: 'cash', uploadedPath: '' }), STAFF_NO_PROOF_PATH);
    assert.equal(
      storedProofPath({ method: 'cash', uploadedPath: 'hotel/stay/123-receipt.jpg' }),
      'hotel/stay/123-receipt.jpg'
    );
    assert.deepEqual(storedProofPath({ method: 'gcash' }), { ok: false, error: PAYMENT_PROOF_REQUIRED });
    assert.equal(
      storedProofPath({ method: 'gcash', uploadedPath: 'hotel/stay/123-gcash.jpg' }),
      'hotel/stay/123-gcash.jpg'
    );
  });

  it('treats only known placeholders as having no photo file', () => {
    assert.equal(isSentinelProofPath(STAFF_NO_PROOF_PATH), true);
    assert.equal(isSentinelProofPath(WALK_IN_DESK_CASH_PROOF_PATH), true);
    assert.equal(isSentinelProofPath('hotel/stay/123-receipt.jpg'), false);
    assert.equal(isSentinelProofPath(''), false);
    assert.equal(isSentinelProofPath(null), false);
    assert.equal(hasProofFile({ size: 12 }), true);
    assert.equal(hasProofFile({ size: 0 }), false);
    assert.equal(hasProofFile(null), false);
  });

  it('prints No photo (cash) on a receipt instead of a sentinel path fragment', () => {
    const formatPath = (path: string) => path.slice(0, 8).toUpperCase();
    assert.equal(formatPath(STAFF_NO_PROOF_PATH), 'STAFF/NO');
    assert.equal(receiptProofReference(STAFF_NO_PROOF_PATH, null, formatPath), NO_PHOTO_CASH_LABEL);
    assert.equal(receiptProofReference(WALK_IN_DESK_CASH_PROOF_PATH, 'ignored.jpg', formatPath), NO_PHOTO_CASH_LABEL);
    assert.equal(receiptProofReference('', null, formatPath), NO_PHOTO_CASH_LABEL);
    assert.equal(
      receiptProofReference('hotel/stay/123-gcash.jpg', 'gcash.jpg', formatPath),
      'gcash.jpg'
    );
    assert.equal(receiptProofReference('hotel/stay/123-gcash.jpg', null, formatPath), 'HOTEL/ST');
    assert.equal(
      receiptProofReference(STAFF_NO_PROOF_PATH, null, formatPath, 'Walang larawan (cash)'),
      'Walang larawan (cash)'
    );
  });
});
