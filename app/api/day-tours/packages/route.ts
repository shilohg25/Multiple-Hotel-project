import { NextResponse } from 'next/server';
import { canAccessHotel, canManageDayTourPackages } from '@/lib/auth';
import { jsonError, requireApiStaff } from '@/lib/api';
import { supabaseAdmin } from '@/lib/supabase-admin';

function optionalText(value: unknown) {
  const text = String(value ?? '').trim();
  return text || null;
}

function optionalNumber(value: unknown) {
  const text = String(value ?? '').trim();
  if (!text) return null;
  const number = Number(text);
  return Number.isFinite(number) ? number : null;
}

export async function POST(request: Request) {
  const auth = await requireApiStaff();
  if (!auth.ok) return auth.response;
  const staff = auth.staff;
  if (!canManageDayTourPackages(staff.profile)) return jsonError('Owner or manager access is required to manage day tour packages.', 403);

  const payload = await request.json();
  const hotelId = String(payload.hotel_id || '');
  const name = String(payload.name || '').trim();
  const adultPrice = Number(payload.adult_price || 0);
  const childPrice = Number(payload.child_price || 0);

  if (!hotelId || !canAccessHotel(staff.profile, hotelId)) return jsonError('Hotel access denied.', 403);
  if (!name) return jsonError('Package name is required.');
  if (!Number.isFinite(adultPrice) || adultPrice < 0) return jsonError('Adult price must be a non-negative number.');
  if (!Number.isFinite(childPrice) || childPrice < 0) return jsonError('Child price must be a non-negative number.');

  const { data, error } = await supabaseAdmin
    .from('day_tour_packages')
    .insert({
      hotel_id: hotelId,
      name,
      description: optionalText(payload.description),
      adult_price: adultPrice,
      child_price: childPrice,
      capacity_per_day: optionalNumber(payload.capacity_per_day),
      breakfast_included: Boolean(payload.breakfast_included),
      lunch_included: Boolean(payload.lunch_included),
      restaurant_remittance_per_guest: Number(payload.restaurant_remittance_per_guest || 0),
      remittance_outlet_id: optionalText(payload.remittance_outlet_id),
      active: payload.active === undefined ? true : Boolean(payload.active),
      created_by: staff.userId
    })
    .select('*')
    .single();

  if (error || !data) return jsonError(error?.message || 'Failed to create day tour package.', 400);
  return NextResponse.json({ package: data });
}
