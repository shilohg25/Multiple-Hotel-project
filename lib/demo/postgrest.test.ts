import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { parseOr, parseSelect } from './postgrest.ts';

describe('demo PostgREST select parser', () => {
  it('parses columns, aliases, embeds, fk hints and !inner', () => {
    const items = parseSelect('*, profiles:confirmed_by(full_name), reservations!inner(hotel_id, guests(full_name), rooms(name))');
    assert.deepEqual(items[0], { kind: 'star' });
    assert.deepEqual(items[1], { kind: 'embed', key: 'profiles', name: 'confirmed_by', hint: null, inner: false, children: [{ kind: 'col', alias: null, name: 'full_name' }] });
    const reservations = items[2];
    assert.equal(reservations.kind, 'embed');
    if (reservations.kind === 'embed') {
      assert.equal(reservations.inner, true);
      assert.equal(reservations.children.length, 3);
      assert.equal(reservations.children[1].kind, 'embed');
    }
  });

  it('parses or() expressions with dotted ISO values and in-lists', () => {
    const parts = parseOr('check_in.eq.2026-11-24,created_at.gte.2026-11-24T00:00:00.000Z,mode_of_payment.like.to_be_billed:*,status.not.in.(cancelled,no_show)');
    assert.deepEqual(parts[0], { kind: 'op', column: 'check_in', op: 'eq', value: '2026-11-24', negate: false });
    assert.deepEqual(parts[1], { kind: 'op', column: 'created_at', op: 'gte', value: '2026-11-24T00:00:00.000Z', negate: false });
    assert.deepEqual(parts[2], { kind: 'op', column: 'mode_of_payment', op: 'like', value: 'to_be_billed:%', negate: false });
    assert.deepEqual(parts[3], { kind: 'op', column: 'status', op: 'in', value: ['cancelled', 'no_show'], negate: true });
  });
});
