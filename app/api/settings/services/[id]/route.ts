import { NextResponse } from 'next/server';
import { canAccessHotel, canManageServiceCatalog } from '@/lib/auth';
import { jsonError, requireApiStaff } from '@/lib/api';
import { normalizeServiceCategory } from '@/lib/service-categories';
import { supabaseAdmin } from '@/lib/supabase-admin';

function optionalText(value: unknown) {
  const text = String(value ?? '').trim();
  return text || null;
}

function moneyChanged(oldValue: unknown, newValue: number) {
  return Math.round(Number(oldValue || 0) * 100) !== Math.round(newValue * 100);
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireApiStaff();
  if (!auth.ok) return auth.response;
  const staff = auth.staff;
  if (!canManageServiceCatalog(staff.profile)) return jsonError('Only owners can manage service items.', 403);

  const { id } = await params;
  const payload = await request.json();
  const name = String(payload.name || '').trim();
  const defaultPrice = Number(payload.default_price ?? 0);

  if (!name) return jsonError('Service name is required.');
  if (!Number.isFinite(defaultPrice) || defaultPrice < 0) return jsonError('Default price must be a valid non-negative number.');

  const { data: current, error: currentError } = await supabaseAdmin
    .from('service_items')
    .select('*')
    .eq('id', id)
    .single();
  if (currentError || !current) return jsonError('Service item not found.', 404);
  if (!canAccessHotel(staff.profile, current.hotel_id)) return jsonError('Hotel access denied.', 403);

  const { data, error } = await supabaseAdmin
    .from('service_items')
    .update({
      name,
      category: normalizeServiceCategory(payload.category),
      description: optionalText(payload.description),
      default_price: defaultPrice,
      remittance_required: Boolean(payload.remittance_required),
      remittance_note: optionalText(payload.remittance_note),
      active: Boolean(payload.active)
    })
    .eq('id', id)
    .select('*')
    .single();

  if (error || !data) return jsonError(error?.message || 'Failed to update service item.', 400);

  if (moneyChanged(current.default_price, defaultPrice)) {
    const { error: logError } = await supabaseAdmin.from('price_change_logs').insert({
      hotel_id: current.hotel_id,
      service_item_id: id,
      changed_type: 'service_price',
      old_value: Number(current.default_price || 0),
      new_value: defaultPrice,
      changed_by: staff.userId,
      notes: `Service ${current.name} default price changed`
    });
    if (logError) return jsonError(`Service saved, but price history failed: ${logError.message}`, 400);
  }

  return NextResponse.json({ service_item: data });
}
