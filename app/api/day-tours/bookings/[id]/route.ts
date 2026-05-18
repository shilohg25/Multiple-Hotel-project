import { NextResponse } from 'next/server';
import { canAccessHotel, canManageDayTourPackages } from '@/lib/auth';
import { jsonError, requireApiStaff } from '@/lib/api';
import { supabaseAdmin } from '@/lib/supabase-admin';

const statuses = ['tentative', 'payment_submitted', 'secured', 'completed', 'cancelled', 'no_show'];

async function getSecuredGuestCount(packageId: string, tourDate: string, ignoreBookingId: string) {
  const { data, error } = await supabaseAdmin
    .from('day_tour_bookings')
    .select('adult_count, child_count')
    .eq('package_id', packageId)
    .eq('tour_date', tourDate)
    .in('status', ['secured', 'completed'])
    .neq('id', ignoreBookingId);
  if (error) throw error;
  return (data || []).reduce((sum, booking) => sum + Number(booking.adult_count || 0) + Number(booking.child_count || 0), 0);
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireApiStaff();
  if (!auth.ok) return auth.response;
  const staff = auth.staff;
  if (!canManageDayTourPackages(staff.profile)) return jsonError('Owner or manager access is required to update day tour bookings.', 403);

  const { id } = await params;
  const payload = await request.json();
  const status = String(payload.status || '').trim();
  if (!statuses.includes(status)) return jsonError('Invalid day tour status.');

  const { data: booking, error: bookingError } = await supabaseAdmin
    .from('day_tour_bookings')
    .select('*, day_tour_packages(*)')
    .eq('id', id)
    .single();
  if (bookingError || !booking) return jsonError('Day tour booking not found.', 404);
  if (!canAccessHotel(staff.profile, booking.hotel_id)) return jsonError('Hotel access denied.', 403);

  if (['secured', 'completed'].includes(status) && booking.package_id && booking.day_tour_packages?.capacity_per_day) {
    try {
      const securedCount = await getSecuredGuestCount(booking.package_id, booking.tour_date, id);
      const nextCount = Number(booking.adult_count || 0) + Number(booking.child_count || 0);
      if (securedCount + nextCount > Number(booking.day_tour_packages.capacity_per_day)) {
        return jsonError('Day tour capacity would be exceeded for this package/date.', 400);
      }
    } catch (error) {
      return jsonError(error instanceof Error ? error.message : 'Failed to check day tour capacity.', 400);
    }
  }

  const { data, error } = await supabaseAdmin
    .from('day_tour_bookings')
    .update({ status })
    .eq('id', id)
    .select('*')
    .single();

  if (error || !data) return jsonError(error?.message || 'Failed to update day tour booking.', 400);
  return NextResponse.json({ booking: data });
}
