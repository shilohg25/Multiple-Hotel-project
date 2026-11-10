import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { allows, canOpenPath, isFrontline } from './access.ts';

describe('staff access', () => {
  it('limits cashier, front desk, and restaurant staff to the daily screens', () => {
    for (const role of ['front_desk', 'cashier', 'restaurant_staff']) {
      assert.equal(isFrontline(role), true);
      assert.equal(allows(role, 'daily'), true);
      assert.equal(allows(role, 'approve'), false);
      assert.equal(allows(role, 'settings'), false);
      assert.equal(allows(role, 'monthly'), false);
      assert.equal(canOpenPath(role, '/today'), true);
      assert.equal(canOpenPath(role, '/sales'), true);
      assert.equal(canOpenPath(role, '/reports/monthly'), false);
      assert.equal(canOpenPath(role, '/settings/rates'), false);
      assert.equal(canOpenPath(role, '/reservations'), false);
    }
  });

  it('lets a manager approve, edit settings, and open monthly reports', () => {
    assert.equal(allows('manager', 'approve'), true);
    assert.equal(allows('manager', 'settings'), true);
    assert.equal(allows('manager', 'monthly'), true);
    assert.equal(allows('manager', 'owner'), false);
    assert.equal(canOpenPath('manager', '/reports/monthly'), true);
  });

  it('lets the owner open everything', () => {
    assert.equal(allows('owner', 'owner'), true);
    assert.equal(canOpenPath('owner', '/hotels'), true);
  });
});