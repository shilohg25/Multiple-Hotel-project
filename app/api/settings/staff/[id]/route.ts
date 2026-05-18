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

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireApiStaff();
  if (!auth.ok) return auth.response;
  const staff = auth.staff;
  if (!canManageStaff(staff.profile)) return jsonError('Only owners can manage staff profiles.', 403);

  const { id } = await params;
  if (!isUUID(id)) return jsonError('A valid staff profile ID is required.');

  const payload = await request.json();
  const role = normalizeRole(payload.role);
  const hotelId = optionalText(payload.hotel_id);
  if (role !== 'owner' && !hotelId) return jsonError('Manager and front desk profiles should be assigned to a hotel.');
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
