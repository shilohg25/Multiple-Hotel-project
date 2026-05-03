import { NextResponse } from 'next/server';
import { requireApiStaff, jsonError } from '@/lib/api';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { slugify } from '@/lib/slug';
import { normalizeDownpaymentType } from '@/lib/downpayment';

function optionalText(value: unknown) {
  const text = String(value || '').trim();
  return text || null;
}

export async function POST(request: Request) {
  const auth = await requireApiStaff();
  if (!auth.ok) return auth.response;
  const staff = auth.staff;
  if (staff.profile.role !== 'owner') return jsonError('Only owners can create hotels.', 403);

  const payload = await request.json();
  const name = String(payload.name || '').trim();
  if (!name) return jsonError('Hotel name is required.');

  const slug = slugify(String(payload.slug || name));
  if (!slug) return jsonError('Valid hotel slug is required.');

  const downpaymentType = normalizeDownpaymentType(payload.downpayment_type);

  const { data, error: insertError } = await supabaseAdmin
    .from('hotels')
    .insert({
      name,
      slug,
      address: optionalText(payload.address),
      contact_email: optionalText(payload.contact_email),
      contact_phone: optionalText(payload.contact_phone),
      booking_email: optionalText(payload.booking_email),
      website_url: optionalText(payload.website_url),
      description: optionalText(payload.description),
      check_in_time: optionalText(payload.check_in_time),
      check_out_time: optionalText(payload.check_out_time),
      downpayment_type: downpaymentType,
      default_downpayment_percent: Number(payload.default_downpayment_percent || 50),
      default_downpayment_amount: Number(payload.default_downpayment_amount || 0),
      house_rules: optionalText(payload.house_rules) || undefined,
      booking_terms: optionalText(payload.booking_terms) || undefined
    })
    .select('*')
    .single();

  if (insertError) return jsonError(insertError.message, 400);
  return NextResponse.json({ hotel: data });
}
