import { APP_ROLES, type AppRole } from './access.ts';

export { APP_ROLES, type AppRole };

export const STAFF_ROLE_LABELS: Record<AppRole, string> = {
  owner: 'Owner',
  manager: 'Manager',
  front_desk: 'Front desk',
  cashier: 'Cashier',
  restaurant_staff: 'Restaurant staff'
};

export const INVALID_STAFF_ROLE_ERROR = `Choose a valid role: ${APP_ROLES.join(', ')}.`;
export const STAFF_HOTEL_REQUIRED_ERROR = 'Manager, front desk, cashier and restaurant staff profiles must be assigned to a hotel.';

export function staffRoleLabel(role: AppRole): string {
  return STAFF_ROLE_LABELS[role];
}

/** Returns the exact app_role value, or null when it is missing or unknown. Never falls back to another role. */
export function parseStaffRole(value: unknown): AppRole | null {
  const role = String(value ?? '').trim();
  return (APP_ROLES as readonly string[]).includes(role) ? (role as AppRole) : null;
}

export function staffAssignmentError(role: AppRole, hotelId: string | null): string | null {
  if (role !== 'owner' && !hotelId) return STAFF_HOTEL_REQUIRED_ERROR;
  return null;
}
