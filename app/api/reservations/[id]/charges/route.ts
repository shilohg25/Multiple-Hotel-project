import { NextResponse } from 'next/server';
import { canAccessHotel, canAddReservationCharges } from '@/lib/auth';
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

function isGeneratedTotalAmountError(error: { message?: string } | null) {
  const message = error?.message || '';
  return message.includes('generated column') || message.includes('non-DEFAULT value into column "total_amount"');
}

async function insertCharge(payload: Record<string, unknown>) {
  const inserted = await supabaseAdmin
    .from('reservation_charges')
    .insert(payload)
    .select('*')
    .single();

  if (!inserted.error || !isGeneratedTotalAmountError(inserted.error)) {
    return inserted;
  }

  const { total_amount: _totalAmount, ...withoutTotal } = payload;
  return supabaseAdmin
    .from('reservation_charges')
    .insert(withoutTotal)
    .select('*')
    .single();
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireApiStaff();
  if (!auth.ok) return auth.response;
  const staff = auth.staff;
  if (!canAddReservationCharges(staff.profile)) return jsonError('You do not have permission to add reservation charges.', 403);

  const { id } = await params;
  const payload = await request.json();

  const { data: reservation, error: reservationError } = await supabaseAdmin
    .from('reservations')
    .select('*')
    .eq('id', id)
    .single();
  if (reservationError || !reservation) return jsonError('Reservation not found.', 404);
  if (!canAccessHotel(staff.profile, reservation.hotel_id)) return jsonError('Hotel access denied.', 403);

  const serviceItemId = optionalText(payload.service_item_id);
  let serviceItem: Record<string, unknown> | null = null;

  if (serviceItemId) {
    const { data, error } = await supabaseAdmin
      .from('service_items')
      .select('*')
      .eq('id', serviceItemId)
      .single();
    if (error || !data) return jsonError('Service item not found.', 404);
    if (data.hotel_id !== reservation.hotel_id) return jsonError('Service item does not belong to this hotel.', 400);
    if (!data.active) return jsonError('Inactive service items cannot be added to reservations.', 400);
    serviceItem = data;
  }

  const quantity = Number(payload.quantity ?? 1);
  const unitPrice = Number(payload.unit_price ?? serviceItem?.default_price ?? 0);
  const description = optionalText(payload.description) || optionalText(serviceItem?.name);
  const category = normalizeServiceCategory(payload.category || serviceItem?.category);

  if (!description) return jsonError('Charge description is required.');
  if (!Number.isFinite(quantity) || quantity <= 0) return jsonError('Quantity must be greater than zero.');
  if (!Number.isFinite(unitPrice) || unitPrice < 0) return jsonError('Unit price must be a valid non-negative number.');

  const totalAmount = roundMoney(quantity * unitPrice);
  const { data: charge, error } = await insertCharge({
    reservation_id: reservation.id,
    hotel_id: reservation.hotel_id,
    service_item_id: serviceItemId,
    description,
    category,
    quantity,
    unit_price: unitPrice,
    total_amount: totalAmount,
    remittance_required: Boolean(payload.remittance_required ?? serviceItem?.remittance_required),
    remittance_note: optionalText(payload.remittance_note) || optionalText(serviceItem?.remittance_note),
    notes: optionalText(payload.notes),
    created_by: staff.userId
  });

  if (error || !charge) return jsonError(error?.message || 'Failed to add charge.', 400);

  await supabaseAdmin.from('audit_logs').insert({
    hotel_id: reservation.hotel_id,
    reservation_id: reservation.id,
    actor_id: staff.userId,
    action: 'reservation.charge_created',
    details: { charge_id: charge.id, total_amount: totalAmount }
  });

  return NextResponse.json({ charge });
}
