import { NextResponse } from 'next/server';
import { canAccessHotel, canManageStaff } from '@/lib/auth';
import { jsonError, requireApiStaff, isUUID, denyUnless } from '@/lib/api';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { INVALID_STAFF_ROLE_ERROR, parseStaffRole, staffAssignmentError } from '@/lib/staff-role';

function optionalText(value: unknown) {
  const text = String(value ?? '').trim();
  return text || null;
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireApiStaff();
  if (!auth.ok) return auth.response;
  const denied = denyUnless(auth.staff, 'owner');
  if (denied) return denied;
  const staff = auth.staff;
  if (!canManageStaff(staff.profile)) return jsonError('Only owners can manage staff profiles.', 403);

  const { id } = await params;
  if (!isUUID(id)) return jsonError('A valid staff profile ID is required.');

  const payload = await request.json();
  const role = parseStaffRole(payload.role);
  if (!role) return jsonError(INVALID_STAFF_ROLE_ERROR);
  const hotelId = optionalText(payload.hotel_id);
  const assignmentError = staffAssignmentError(role, hotelId);
  if (assignmentError) return jsonError(assignmentError);
  if (hotelId && !canAccessHotel(staff.profile, hotelId)) return jsonError('Hotel access denied.', 403);

  const { data, error } = await supabaseAdmin
    .from('profiles')
    .update({
      full_name: optionalText(payload.full_name),
      role,
      hotel_id: role === 'owner' ? hotelId : hotelId
    })
    .eq('id', id)
    .select('id, full_name, role, hotel_id')
    .single();

  if (error || !data) return jsonError(error?.message || 'Failed to update staff profile.', 400);
  return NextResponse.json({ profile: data });
}
