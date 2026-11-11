import { NextResponse } from 'next/server';
import { canAccessHotel, canManageServiceCatalog } from '@/lib/auth';
import { jsonError, requireApiStaff, denyUnless } from '@/lib/api';
import { normalizeServiceCategory } from '@/lib/service-categories';
import { supabaseAdmin } from '@/lib/supabase-admin';

function optionalText(value: unknown) {
  const text = String(value ?? '').trim();
  return text || null;
}

export async function POST(request: Request) {
  const auth = await requireApiStaff();
  if (!auth.ok) return auth.response;
  const denied = denyUnless(auth.staff, 'settings');
  if (denied) return denied;
  const staff = auth.staff;
  if (!canManageServiceCatalog(staff.profile)) return jsonError('Only owners can manage service items.', 403);

  const payload = await request.json();
  const hotelId = String(payload.hotel_id || '');
  const name = String(payload.name || '').trim();
  const defaultPrice = Number(payload.default_price ?? 0);

  if (!hotelId || !canAccessHotel(staff.profile, hotelId)) return jsonError('Hotel access denied.', 403);
  if (!name) return jsonError('Service name is required.');
  if (!Number.isFinite(defaultPrice) || defaultPrice < 0) return jsonError('Default price must be a valid non-negative number.');

  const { data, error } = await supabaseAdmin
    .from('service_items')
    .insert({
      hotel_id: hotelId,
      name,
      category: normalizeServiceCategory(payload.category),
      description: optionalText(payload.description),
      default_price: defaultPrice,
      charge_unit: String(payload.charge_unit || 'each'),
      outlet_owed_amount: Number(payload.outlet_owed_amount || 0),
      outlet_owed_unit: String(payload.outlet_owed_unit || 'none'),
      remittance_required: Boolean(payload.remittance_required),
      remittance_note: optionalText(payload.remittance_note),
      active: payload.active === undefined ? true : Boolean(payload.active),
      created_by: staff.userId
    })
    .select('*')
    .single();

  if (error || !data) return jsonError(error?.message || 'Failed to create service item.', 400);
  return NextResponse.json({ service_item: data });
}
