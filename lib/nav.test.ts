import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { flattenNavItems, formatHeaderIdentity, getStaffNavGroups, isNavItemActive } from './nav.ts';

const OWNER_HREFS = [
  '/today',
  '/dashboard',
  '/reservations',
  '/board',
  '/payments',
  '/sales',
  '/reports/daily',
  '/reports/monthly',
  '/remittances',
  '/rooms',
  '/day-tours',
  '/hotels',
  '/offline',
  '/help',
  '/settings'
];

const ORIGINAL_OWNER_HREFS = [
  '/today',
  '/dashboard',
  '/reservations',
  '/board',
  '/payments',
  '/sales',
  '/reports/daily',
  '/reports/monthly',
  '/rooms',
  '/remittances',
  '/day-tours',
  '/offline',
  '/help',
  '/hotels',
  '/settings'
];

describe('staff nav grouping', () => {
  it('keeps every current owner link, including Board and Settings, in logical groups', () => {
    const groups = getStaffNavGroups('owner');
    assert.deepEqual(groups.map((group) => group.id), ['daily', 'reporting', 'property', 'more']);
    assert.deepEqual(flattenNavItems(groups).map((item) => item.href), OWNER_HREFS);
    assert.deepEqual(new Set(OWNER_HREFS), new Set(ORIGINAL_OWNER_HREFS));
    assert.equal(flattenNavItems(groups).some((item) => item.href === '/board'), true);
    assert.equal(flattenNavItems(groups).some((item) => item.href === '/pricing'), false);
  });

  it('trims Board from the manager menu and keeps the other owner links', () => {
    const hrefs = flattenNavItems(getStaffNavGroups('manager')).map((item) => item.href);
    assert.equal(hrefs.includes('/board'), false);
    assert.equal(hrefs.includes('/pricing'), false);
    assert.deepEqual(
      hrefs,
      OWNER_HREFS.filter((href) => href !== '/board')
    );
  });

  it('limits front desk, cashier, and restaurant staff to the daily screens', () => {
    for (const role of ['front_desk', 'cashier', 'restaurant_staff']) {
      const hrefs = flattenNavItems(getStaffNavGroups(role)).map((item) => item.href);
      assert.deepEqual(hrefs, ['/today', '/sales', '/offline', '/help']);
    }
  });

  it('treats an unknown non-frontline role like the owner menu', () => {
    assert.deepEqual(
      flattenNavItems(getStaffNavGroups('admin')).map((item) => item.href),
      OWNER_HREFS
    );
    assert.deepEqual(
      flattenNavItems(getStaffNavGroups(null)).map((item) => item.href),
      OWNER_HREFS
    );
  });
});

describe('nav active matching', () => {
  it('marks an exact path as active and ignores siblings', () => {
    assert.equal(isNavItemActive('/today', '/today'), true);
    assert.equal(isNavItemActive('/today', '/today/'), true);
    assert.equal(isNavItemActive('/reports/daily', '/reports/daily'), true);
    assert.equal(isNavItemActive('/reports/daily', '/reports/monthly'), false);
    assert.equal(isNavItemActive('/reports/monthly', '/reports/daily'), false);
    assert.equal(isNavItemActive('/reservations', '/today'), false);
    assert.equal(isNavItemActive('/help', '/help'), true);
  });

  it('marks a parent nav item active on its subpages', () => {
    assert.equal(isNavItemActive('/today', '/today/close'), true);
    assert.equal(isNavItemActive('/reservations', '/reservations/new'), true);
    assert.equal(isNavItemActive('/reservations', '/reservations/abc-123'), true);
    assert.equal(isNavItemActive('/settings', '/settings/rates'), true);
    assert.equal(isNavItemActive('/sales', '/sales/anything'), true);
    assert.equal(isNavItemActive('/board', '/board/extra'), true);
  });

  it('does not treat a shorter unrelated prefix as active', () => {
    assert.equal(isNavItemActive('/', '/today'), false);
    assert.equal(isNavItemActive('/sale', '/sales'), false);
    assert.equal(isNavItemActive('/report', '/reports/daily'), false);
    assert.equal(isNavItemActive('/reservations', '/reservations-archive'), false);
    assert.equal(isNavItemActive('', '/today'), false);
    assert.equal(isNavItemActive('/today', ''), false);
    assert.equal(isNavItemActive('/today', null), false);
  });
});

describe('header identity', () => {
  it('does not repeat a role already present in the name', () => {
    assert.deepEqual(formatHeaderIdentity('TEST- Cashier', 'cashier'), {
      name: 'TEST- Cashier',
      roleLabel: null
    });
    assert.deepEqual(formatHeaderIdentity('TEST- Front Desk', 'front_desk'), {
      name: 'TEST- Front Desk',
      roleLabel: null
    });
    assert.deepEqual(formatHeaderIdentity('Pat Manager', 'manager'), {
      name: 'Pat Manager',
      roleLabel: null
    });
    assert.deepEqual(formatHeaderIdentity('TEST- Demo Restaurant', 'restaurant_staff'), {
      name: 'TEST- Demo Restaurant',
      roleLabel: null
    });
  });

  it('shows a readable role when the name does not already include it', () => {
    assert.deepEqual(formatHeaderIdentity('Ana Santos', 'manager'), {
      name: 'Ana Santos',
      roleLabel: 'Manager'
    });
    assert.deepEqual(formatHeaderIdentity('Ana Santos', 'front_desk'), {
      name: 'Ana Santos',
      roleLabel: 'Front desk'
    });
    assert.deepEqual(formatHeaderIdentity('Ana Santos', 'restaurant_staff'), {
      name: 'Ana Santos',
      roleLabel: 'Restaurant staff'
    });
    assert.deepEqual(formatHeaderIdentity('Ana Santos', 'owner'), {
      name: 'Ana Santos',
      roleLabel: 'Owner'
    });
  });

  it('falls back to Staff when the name is missing', () => {
    assert.deepEqual(formatHeaderIdentity(null, 'owner'), { name: 'Staff', roleLabel: 'Owner' });
    assert.deepEqual(formatHeaderIdentity('   ', 'manager'), { name: 'Staff', roleLabel: 'Manager' });
    assert.deepEqual(formatHeaderIdentity('Ana Santos', null), { name: 'Ana Santos', roleLabel: null });
  });
});
