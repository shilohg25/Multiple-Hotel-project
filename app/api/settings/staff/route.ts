import { NextResponse } from 'next/server';
import { canAccessHotel, canManageStaff } from '@/lib/auth';
import { jsonError, requireApiStaff, isUUID } from '@/lib/api';
import { supabaseAdmin } from '@/lib/supabase-admin';
import type { Role } from '@/types/app';

const roles: Role[] = ['owner', 'manager', 'front_desk'];

function optionalText(value: unknown) {
  const text = String(value ?? '').trim();
  return text || null;
}

function normalizeRole(value: unknown): Role {
  const role = String(value || '').trim() as Role;
  return roles.includes(role) ? role : 'front_desk';
}

function validateAssignment(role: Role, hotelId: string | null) {
  if (role !== 'owner' && !hotelId) {
    return 'Manager and front desk profiles should be assigned to a hotel.';
  }
  return null;
}

export async function POST(request: Request) {
  const auth = await requireApiStaff();
  if (!auth.ok) return auth.response;
  const staff = auth.staff;
  if (!canManageStaff(staff.profile)) return jsonError('Only owners can manage staff profiles.', 403);

  const payload = await request.json();
  const id = String(payload.id || '').trim();
  const role = normalizeRole(payload.role);
  const hotelId = optionalText(payload.hotel_id);

  if (!isUUID(id)) return jsonError('A valid Auth user UUID is required.');
  const assignmentError = validateAssignment(role, hotelId);
  if (assignmentError) return jsonError(assignmentError);
  if (hotelId && !canAccessHotel(staff.profile, hotelId)) return jsonError('Hotel access denied.', 403);

  const { data, error } = await supabaseAdmin
    .from('profiles')
    .upsert({
      id,
      full_name: optionalText(payload.full_name),
      role,
      hotel_id: role === 'owner' ? hotelId : hotelId
    }, { onConflict: 'id' })
    .select('id, full_name, role, hotel_id')
    .single();

  if (error || !data) return jsonError(error?.message || 'Failed to save staff profile.', 400);
  return NextResponse.json({ profile: data });
}
