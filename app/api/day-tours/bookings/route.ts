import { NextResponse } from 'next/server';
import { canAccessHotel, canAddReservationCharges } from '@/lib/auth';
import { jsonError, requireApiStaff } from '@/lib/api';
import { supabaseAdmin } from '@/lib/supabase-admin';

export const runtime = 'nodejs';

function cleanFileName(name: string) {
  return name.toLowerCase().replace(/[^a-z0-9.\-_]+/g, '-').replace(/-+/g, '-').slice(0, 100) || 'proof';
}

function optionalText(value: FormDataEntryValue | null) {
  const text = String(value ?? '').trim();
  return text || null;
}

async function getSecuredGuestCount(packageId: string, tourDate: string) {
  const { data, error } = await supabaseAdmin
    .from('day_tour_bookings')
    .select('adult_count, child_count')
    .eq('package_id', packageId)
    .eq('tour_date', tourDate)
    .in('status', ['secured', 'completed']);
  if (error) throw error;
  return (data || []).reduce((sum, booking) => sum + Number(booking.adult_count || 0) + Number(booking.child_count || 0), 0);
}

export async function POST(request: Request) {
  const auth = await requireApiStaff();
  if (!auth.ok) return auth.response;
  const staff = auth.staff;
  if (!canAddReservationCharges(staff.profile)) return jsonError('You do not have permission to create day tour bookings.', 403);

  const form = await request.formData();
  const hotelId = String(form.get('hotel_id') || '');
  const packageId = String(form.get('package_id') || '');
  const guestName = String(form.get('guest_name') || '').trim();
  const tourDate = String(form.get('tour_date') || '');
  const adultCount = Number(form.get('adult_count') || 0);
  const childCount = Number(form.get('child_count') || 0);
  const status = String(form.get('status') || 'tentative');
  const proof = form.get('proof');
  const paymentAmount = Number(form.get('payment_amount') || 0);
  const paymentDetails = String(form.get('payment_details') || '').trim();

  if (!hotelId || !canAccessHotel(staff.profile, hotelId)) return jsonError('Hotel access denied.', 403);
  if (!packageId) return jsonError('Day tour package is required.');
  if (!guestName) return jsonError('Guest name is required.');
  if (!tourDate) return jsonError('Tour date is required.');
  if (!Number.isFinite(adultCount) || adultCount < 0 || !Number.isFinite(childCount) || childCount < 0) return jsonError('Guest counts must be valid.');
  if (adultCount + childCount <= 0) return jsonError('At least one guest is required.');
  if (!['tentative', 'payment_submitted'].includes(status)) return jsonError('New day tour bookings can start tentative or payment_submitted.');

  const { data: packageRow, error: packageError } = await supabaseAdmin
    .from('day_tour_packages')
    .select('*')
    .eq('id', packageId)
    .eq('hotel_id', hotelId)
    .single();
  if (packageError || !packageRow) return jsonError('Day tour package not found.', 404);
  if (!packageRow.active) return jsonError('Inactive day tour packages cannot be booked.', 400);

  if (status === 'payment_submitted') {
    if (!paymentDetails) return jsonError('Payment information is required for payment-submitted day tours.');
    if (!Number.isFinite(paymentAmount) || paymentAmount <= 0) return jsonError('Payment amount is required for payment-submitted day tours.');
    if (!(proof instanceof File) || proof.size === 0) return jsonError('Payment proof is required for payment-submitted day tours.');
  }

  const totalAmount = Number(packageRow.adult_price || 0) * adultCount + Number(packageRow.child_price || 0) * childCount;
  const downpaymentRequired = Number(form.get('downpayment_required') || 0);

  const bookingId = crypto.randomUUID();
  let proofPath: string | null = null;

  if (proof instanceof File && proof.size > 0) {
    proofPath = `${hotelId}/day-tours/${bookingId}/${Date.now()}-${cleanFileName(proof.name)}`;
    const buffer = Buffer.from(await proof.arrayBuffer());
    const { error: uploadError } = await supabaseAdmin.storage
      .from('payment-proofs')
      .upload(proofPath, buffer, { contentType: proof.type || 'application/octet-stream', upsert: false });
    if (uploadError) return jsonError(uploadError.message, 400);
  }

  try {
    if (['secured', 'completed'].includes(status) && packageRow.capacity_per_day) {
      const securedCount = await getSecuredGuestCount(packageId, tourDate);
      if (securedCount + adultCount + childCount > Number(packageRow.capacity_per_day)) {
        return jsonError('Day tour capacity would be exceeded for this package/date.', 400);
      }
    }
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : 'Failed to check day tour capacity.', 400);
  }

  const { data: booking, error: bookingError } = await supabaseAdmin
    .from('day_tour_bookings')
    .insert({
      id: bookingId,
      hotel_id: hotelId,
      package_id: packageId,
      guest_name: guestName,
      guest_email: optionalText(form.get('guest_email')),
      guest_phone: optionalText(form.get('guest_phone')),
      tour_date: tourDate,
      adult_count: adultCount,
      child_count: childCount,
      total_amount: totalAmount,
      downpayment_required: downpaymentRequired,
      status,
      payment_details: paymentDetails || null,
      proof_path: proofPath,
      notes: optionalText(form.get('notes')),
      created_by: staff.userId
    })
    .select('*')
    .single();

  if (bookingError || !booking) {
    if (proofPath) await supabaseAdmin.storage.from('payment-proofs').remove([proofPath]);
    return jsonError(bookingError?.message || 'Failed to create day tour booking.', 400);
  }

  if (proofPath && paymentAmount > 0 && paymentDetails) {
    const { error: paymentError } = await supabaseAdmin.from('day_tour_payments').insert({
      day_tour_booking_id: booking.id,
      hotel_id: hotelId,
      amount: paymentAmount,
      method: String(form.get('method') || 'other'),
      payer_name: optionalText(form.get('payer_name')),
      payment_reference: optionalText(form.get('payment_reference')),
      payment_details: paymentDetails,
      proof_path: proofPath,
      proof_original_name: proof instanceof File ? proof.name : null,
      status: 'submitted'
    });
    if (paymentError) return jsonError(paymentError.message, 400);
  }

  return NextResponse.json({ booking });
}
