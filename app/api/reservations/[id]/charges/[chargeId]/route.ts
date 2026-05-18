import { NextResponse } from 'next/server';
import { canAccessHotel, canDeleteReservationCharges, canManageReservationCharges } from '@/lib/auth';
import { jsonError, requireApiStaff } from '@/lib/api';
import { normalizeServiceCategory } from '@/lib/service-categories';
import { supabaseAdmin } from '@/lib/supabase-admin';

function optionalText(value: unknown) {
  const text = String(value ?? '').trim();
  return text || null;
}

function roundMoney(value: number) {
  return Math.round(value * 100) / 100;
}

function hasOwn(object: Record<string, unknown>, key: string) {
  return Object.prototype.hasOwnProperty.call(object, key);
}

function isGeneratedTotalAmountError(error: { message?: string } | null) {
  const message = error?.message || '';
  return message.includes('generated column') || message.includes('non-DEFAULT value into column "total_amount"');
}

async function updateCharge(chargeId: string, payload: Record<string, unknown>) {
  const updated = await supabaseAdmin
    .from('reservation_charges')
    .update(payload)
    .eq('id', chargeId)
    .select('*')
    .single();

  if (!updated.error || !isGeneratedTotalAmountError(updated.error)) {
    return updated;
  }

  const { total_amount: _totalAmount, ...withoutTotal } = payload;
  return supabaseAdmin
    .from('reservation_charges')
    .update(withoutTotal)
    .eq('id', chargeId)
    .select('*')
    .single();
}

async function getCharge(chargeId: string) {
  return supabaseAdmin
    .from('reservation_charges')
    .select('*')
    .eq('id', chargeId)
    .single();
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string; chargeId: string }> }) {
  const auth = await requireApiStaff();
  if (!auth.ok) return auth.response;
  const staff = auth.staff;
  if (!canManageReservationCharges(staff.profile)) return jsonError('Owner or manager access is required to update charges.', 403);

  const { id, chargeId } = await params;
  const payload = await request.json() as Record<string, unknown>;
  const { data: current, error: currentError } = await getCharge(chargeId);
  if (currentError || !current) return jsonError('Charge not found.', 404);
  if (current.reservation_id !== id) return jsonError('Charge does not belong to this reservation.', 400);
  if (!canAccessHotel(staff.profile, current.hotel_id)) return jsonError('Hotel access denied.', 403);

  const serviceItemId = hasOwn(payload, 'service_item_id') ? optionalText(payload.service_item_id) : current.service_item_id;
  let serviceItem: Record<string, unknown> | null = null;

  if (serviceItemId) {
    const { data, error } = await supabaseAdmin
      .from('service_items')
      .select('*')
      .eq('id', serviceItemId)
      .single();
    if (error || !data) return jsonError('Service item not found.', 404);
    if (data.hotel_id !== current.hotel_id) return jsonError('Service item does not belong to this hotel.', 400);
    serviceItem = data;
  }

  const description = hasOwn(payload, 'description') ? optionalText(payload.description) : current.description;
  const quantity = hasOwn(payload, 'quantity') ? Number(payload.quantity) : Number(current.quantity || 1);
  const unitPrice = hasOwn(payload, 'unit_price') ? Number(payload.unit_price) : Number(current.unit_price || 0);

  if (!description) return jsonError('Charge description is required.');
  if (!Number.isFinite(quantity) || quantity <= 0) return jsonError('Quantity must be greater than zero.');
  if (!Number.isFinite(unitPrice) || unitPrice < 0) return jsonError('Unit price must be a valid non-negative number.');

  const totalAmount = roundMoney(quantity * unitPrice);
  const categorySource = hasOwn(payload, 'category') ? payload.category : serviceItem?.category || current.category;
  const remittanceRequired = hasOwn(payload, 'remittance_required')
    ? Boolean(payload.remittance_required)
    : Boolean(current.remittance_required);

  const { data: charge, error } = await updateCharge(chargeId, {
    service_item_id: serviceItemId,
    description,
    category: normalizeServiceCategory(categorySource),
    quantity,
    unit_price: unitPrice,
    total_amount: totalAmount,
    remittance_required: remittanceRequired,
    remittance_note: hasOwn(payload, 'remittance_note') ? optionalText(payload.remittance_note) : current.remittance_note,
    notes: hasOwn(payload, 'notes') ? optionalText(payload.notes) : current.notes
  });

  if (error || !charge) return jsonError(error?.message || 'Failed to update charge.', 400);

  await supabaseAdmin.from('audit_logs').insert({
    hotel_id: current.hotel_id,
    reservation_id: id,
    actor_id: staff.userId,
    action: 'reservation.charge_updated',
    details: { charge_id: chargeId, total_amount: totalAmount }
  });

  return NextResponse.json({ charge });
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string; chargeId: string }> }) {
  const auth = await requireApiStaff();
  if (!auth.ok) return auth.response;
  const staff = auth.staff;
  if (!canDeleteReservationCharges(staff.profile)) return jsonError('Only owners can delete reservation charges.', 403);

  const { id, chargeId } = await params;
  const { data: current, error: currentError } = await getCharge(chargeId);
  if (currentError || !current) return jsonError('Charge not found.', 404);
  if (current.reservation_id !== id) return jsonError('Charge does not belong to this reservation.', 400);
  if (!canAccessHotel(staff.profile, current.hotel_id)) return jsonError('Hotel access denied.', 403);

  const { error } = await supabaseAdmin
    .from('reservation_charges')
    .delete()
    .eq('id', chargeId);
  if (error) return jsonError(error.message, 400);

  await supabaseAdmin.from('audit_logs').insert({
    hotel_id: current.hotel_id,
    reservation_id: id,
    actor_id: staff.userId,
    action: 'reservation.charge_deleted',
    details: { charge_id: chargeId, total_amount: Number(current.total_amount || 0) }
  });

  return NextResponse.json({ ok: true });
}
