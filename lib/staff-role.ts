import { APP_ROLES, type AppRole } from './access.ts';

export const INVALID_STAFF_ROLE_ERROR = `Choose a valid role: ${APP_ROLES.join(', ')}.`;
export const STAFF_HOTEL_REQUIRED_ERROR = 'Manager, front desk, cashier and restaurant staff profiles must be assigned to a hotel.';

/** Returns the exact app_role value, or null when it is missing or unknown. Never falls back to another role. */
export function parseStaffRole(value: unknown): AppRole | null {
  const role = String(value ?? '').trim();
  return (APP_ROLES as readonly string[]).includes(role) ? (role as AppRole) : null;
}

export function staffAssignmentError(role: AppRole, hotelId: string | null): string | null {
  if (role !== 'owner' && !hotelId) return STAFF_HOTEL_REQUIRED_ERROR;
  return null;
}
