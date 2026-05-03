import { NextResponse } from 'next/server';
import { getStaffContext, type StaffContext } from './auth';

export function jsonError(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status });
}

export async function requireApiStaff(): Promise<{ ok: false; response: ReturnType<typeof jsonError> } | { ok: true; staff: StaffContext }> {
  const staff = await getStaffContext();
  if (!staff) return { ok: false, response: jsonError('Unauthorized', 401) };
  return { ok: true, staff };
}

export function requiredString(value: unknown, label: string): string {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error(`${label} is required`);
  }
  return value.trim();
}

export function isUUID(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}
