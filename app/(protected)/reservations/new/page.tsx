import { requireStaff, canAccessHotel } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { ReservationForm } from '@/components/ReservationForm';
import type { Hotel, Room } from '@/types/app';

export default async function NewReservationPage() {
  const staff = await requireStaff();
  const [{ data: hotelsRaw }, { data: roomsRaw }] = await Promise.all([
    supabaseAdmin.from('hotels').select('*').eq('active', true).order('name'),
    supabaseAdmin.from('rooms').select('*').eq('active', true).order('sort_order').order('name')
  ]);
  const hotels = ((hotelsRaw || []) as Hotel[]).filter((hotel) => canAccessHotel(staff.profile, hotel.id));
  const hotelIds = new Set(hotels.map((hotel) => hotel.id));
  const rooms = ((roomsRaw || []) as Room[]).filter((room) => hotelIds.has(room.hotel_id));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-black tracking-tight">New reservation</h1>
        <p className="mt-1 text-slate-500">A room is held only with a payment. Walk-ins are cash at the desk. OTA, LGU, and company stays need a payment record for at least half the stay in the same save.</p>
      </div>
      <ReservationForm hotels={hotels} rooms={rooms} />
    </div>
  );
}
