import { NextResponse } from 'next/server';
import { requireApiStaff, jsonError } from '@/lib/api';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { slugify } from '@/lib/slug';

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

  const { data, error: insertError } = await supabaseAdmin
    .from('hotels')
    .insert({
      name,
      slug,
      address: payload.address || null,
      contact_email: payload.contact_email || null,
      contact_phone: payload.contact_phone || null,
      default_downpayment_percent: Number(payload.default_downpayment_percent || 50),
      house_rules: payload.house_rules || undefined
    })
    .select('*')
    .single();

  if (insertError) return jsonError(insertError.message, 400);
  return NextResponse.json({ hotel: data });
}
