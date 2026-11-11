import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { isRoomOverlapError, ROOM_JUST_TAKEN } from './room-overlap.ts';

describe('isRoomOverlapError', () => {
  it('recognizes an exclusion constraint from a booking race', () => {
    assert.equal(isRoomOverlapError({
      code: '23P01',
      message: 'conflicting key value violates exclusion constraint "prevent_holding_room_overlap"'
    }), true);
    assert.equal(ROOM_JUST_TAKEN.includes('Please pick other dates'), true);
  });

  it('leaves unrelated database errors alone', () => {
    assert.equal(isRoomOverlapError({ code: '23505', message: 'duplicate key value violates unique constraint' }), false);
    assert.equal(isRoomOverlapError(null), false);
  });
});
