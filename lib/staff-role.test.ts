import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { APP_ROLES } from './access.ts';
import { parseStaffRole, staffAssignmentError, STAFF_HOTEL_REQUIRED_ERROR } from './staff-role.ts';

describe('staff role parsing', () => {
  it('keeps every app role exactly, including cashier and restaurant staff', () => {
    for (const role of APP_ROLES) assert.equal(parseStaffRole(role), role);
    assert.equal(parseStaffRole('cashier'), 'cashier');
    assert.equal(parseStaffRole(' restaurant_staff '), 'restaurant_staff');
  });

  it('refuses unknown or missing roles instead of saving them as front desk', () => {
    for (const value of ['', null, undefined, 'restaurant', 'Cashier', 'admin', 'service_role']) {
      assert.equal(parseStaffRole(value), null);
    }
  });

  it('requires a hotel for every non-owner role', () => {
    assert.equal(staffAssignmentError('owner', null), null);
    for (const role of ['manager', 'front_desk', 'cashier', 'restaurant_staff'] as const) {
      assert.equal(staffAssignmentError(role, null), STAFF_HOTEL_REQUIRED_ERROR);
      assert.equal(staffAssignmentError(role, 'hotel-1'), null);
    }
  });
});
