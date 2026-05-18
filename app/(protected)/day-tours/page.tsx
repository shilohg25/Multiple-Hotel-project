import { requireStaff, canAccessHotel, canManageDayTourPackages } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { DayTourBookingsManager } from '@/components/DayTourBookingsManager';
import type { DayTourBooking, Hotel } from '@/types/app';

type SearchParams = { hotel?: string };

export default async function DayToursPage({ searchParams }: { searchParams?: Promise<SearchParams> }) {
  const params = (await searchParams) || {};
  const staff = await requireStaff();
  const { data: hotelsRaw } = await supabaseAdmin.from('hotels').select('*').eq('active', true).order('name');
  const hotels = ((hotelsRaw || []) as Hotel[]).filter((hotel) => canAccessHotel(staff.profile, hotel.id));
  const selectedHotel = hotels.find((hotel) => hotel.id === params.hotel) || hotels[0];

  if (!selectedHotel) {
    return <div className="card p-6 text-sm text-slate-500">Create a hotel before adding day tours.</div>;
  }

  const { data: bookingsRaw } = await supabaseAdmin
    .from('day_tour_bookings')
    .select('*, day_tour_packages(id,name,capacity_per_day)')
    .eq('hotel_id', selectedHotel.id)
    .order('tour_date', { ascending: false });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-black tracking-tight">Day Tours</h1>
        <p className="mt-1 text-slate-500">Basic day tour bookings, payment proof tracking, and capacity-aware status updates.</p>
      </div>
      <DayTourBookingsManager
        hotels={hotels}
        selectedHotel={selectedHotel}
        bookings={(bookingsRaw || []) as DayTourBooking[]}
        canManage={canManageDayTourPackages(staff.profile)}
      />
    </div>
  );
}
