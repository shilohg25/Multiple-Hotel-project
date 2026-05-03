import { notFound } from 'next/navigation';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { PublicBookingForm } from '@/components/PublicBookingForm';
import type { Hotel, Room } from '@/types/app';

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

  return (
    <main className="min-h-screen px-4 py-8">
      <div className="mx-auto max-w-4xl space-y-6">
        <section className="card p-6">
          <p className="text-sm font-semibold uppercase tracking-wide text-slate-500">{hotel.name}</p>
          <h1 className="mt-2 text-4xl font-black tracking-tight">Book your stay</h1>
          <p className="mt-3 whitespace-pre-line text-slate-600">{hotel.booking_terms}</p>
        </section>
        <PublicBookingForm hotel={hotel} rooms={rooms} />
      </div>
    </main>
  );
}
