import { requireStaff, canAccessHotel } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { DayTourBookingForm } from '@/components/DayTourBookingForm';
import type { DayTourPackage, Hotel } from '@/types/app';

type SearchParams = { hotel?: string };

export default async function NewDayTourBookingPage({ searchParams }: { searchParams?: Promise<SearchParams> }) {
  const params = (await searchParams) || {};
  const staff = await requireStaff();
  const { data: hotelsRaw } = await supabaseAdmin.from('hotels').select('*').eq('active', true).order('name');
  const hotels = ((hotelsRaw || []) as Hotel[]).filter((hotel) => canAccessHotel(staff.profile, hotel.id));
  const selectedHotel = hotels.find((hotel) => hotel.id === params.hotel) || hotels[0];

  if (!selectedHotel) {
    return <div className="card p-6 text-sm text-slate-500">Create a hotel before adding day tour bookings.</div>;
  }

  const { data: packagesRaw } = await supabaseAdmin
    .from('day_tour_packages')
    .select('*')
    .eq('hotel_id', selectedHotel.id)
    .eq('active', true)
    .order('name');

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-black tracking-tight">New Day Tour Booking</h1>
        <p className="mt-1 text-slate-500">Day tours are separate from room inventory and never block rooms.</p>
      </div>
      <DayTourBookingForm hotels={hotels} selectedHotel={selectedHotel} packages={(packagesRaw || []) as DayTourPackage[]} />
    </div>
  );
}
