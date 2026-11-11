import { notFound } from 'next/navigation';
import { businessToday } from '@/lib/date';
import { formatHotelTime } from '@/lib/stay-hours';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { PublicBookingForm } from '@/components/PublicBookingForm';
import type { Hotel, Room } from '@/types/app';

export const dynamic = 'force-dynamic';

export default async function PublicBookingPage({ params }: { params: Promise<{ hotelSlug: string }> }) {
  const { hotelSlug } = await params;
  const { data: hotelRaw, error } = await supabaseAdmin
    .from('hotels')
    .select('*')
    .eq('slug', hotelSlug)
    .eq('active', true)
    .single();

  if (error || !hotelRaw) notFound();
  const hotel = hotelRaw as Hotel;
  const { data: roomsRaw } = await supabaseAdmin
    .from('rooms')
    .select('*')
    .eq('hotel_id', hotel.id)
    .eq('active', true)
    .order('sort_order')
    .order('name');

  const rooms = (roomsRaw || []) as Room[];
  const typeIds = rooms.map((room) => room.room_type_id).filter((id): id is string => Boolean(id));
  const rateResult = typeIds.length
    ? await supabaseAdmin.from('room_type_channel_rates').select('room_type_id, rate').eq('channel', 'walk_in').in('room_type_id', typeIds)
    : { data: [], error: null };
  if (rateResult.error) console.error(rateResult.error);
  const walkIn = new Map((rateResult.data || []).map((row) => [row.room_type_id as string, Number(row.rate)]));
  const quotedRooms = rooms.map((room) => ({ ...room, quoted_rate: walkIn.get(room.room_type_id || '') ?? Number(room.base_rate || 0) }));
  const checkInLabel = formatHotelTime(hotel.check_in_time, '14:00');
  const checkOutLabel = (hotel.check_out_time || '12:00').slice(0, 5) === '12:00' ? '12:00 noon' : formatHotelTime(hotel.check_out_time, '12:00');

  return (
    <main className="min-h-screen px-4 py-8">
      <div className="mx-auto max-w-4xl space-y-6">
        <section className="card p-6">
          <p className="text-sm font-semibold uppercase tracking-wide text-slate-500">{hotel.name}</p>
          <h1 className="mt-2 text-4xl font-black tracking-tight">Book your stay</h1>
          <p className="mt-3 font-semibold">Check-in {checkInLabel}, check-out {checkOutLabel}</p>
          <p className="mt-3 whitespace-pre-line text-slate-600">{hotel.booking_terms}</p>
        </section>
        <PublicBookingForm hotel={hotel} rooms={quotedRooms} today={businessToday(hotel.timezone)} />
      </div>
    </main>
  );
}
