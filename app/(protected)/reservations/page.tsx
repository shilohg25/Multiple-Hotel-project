import { supabaseAdmin } from '@/lib/supabase-admin';
import { requireStaff, canAccessHotel } from '@/lib/auth';
import { monthRange } from '@/lib/date';
import { ReservationBoard } from '@/components/ReservationBoard';
import type { Hotel, Reservation, Room } from '@/types/app';

type SearchParams = { hotel?: string; from?: string; to?: string };

export default async function ReservationsPage({ searchParams }: { searchParams?: Promise<SearchParams> }) {
  const params = (await searchParams) || {};
  const staff = await requireStaff();
  const { from: defaultFrom, to: defaultTo } = monthRange();
  const from = params.from || defaultFrom;
  const to = params.to || defaultTo;

  const { data: hotelsRaw } = await supabaseAdmin.from('hotels').select('*').eq('active', true).order('name');
  const hotels = ((hotelsRaw || []) as Hotel[]).filter((hotel) => canAccessHotel(staff.profile, hotel.id));
  const hotel = hotels.find((item) => item.id === params.hotel) || hotels[0];

  if (!hotel) {
    return (
      <div className="card p-6">
        <h1 className="text-2xl font-black">Reservations</h1>
        <p className="mt-2 text-sm text-slate-500">Create a hotel first.</p>
      </div>
    );
  }

  const [{ data: roomsRaw }, { data: reservationsRaw }] = await Promise.all([
    supabaseAdmin.from('rooms').select('*').eq('hotel_id', hotel.id).eq('active', true).order('sort_order').order('name'),
    supabaseAdmin
      .from('reservations')
      .select('*, guests(*), rooms(id,name,room_type_name)')
      .eq('hotel_id', hotel.id)
      .lt('check_in', to)
      .gt('check_out', from)
      .not('status', 'in', '(cancelled,no_show)')
      .order('check_in')
  ]);

  const rooms = (roomsRaw || []) as Room[];
  const reservations = (reservationsRaw || []) as Reservation[];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-black tracking-tight">Reservations</h1>
        <p className="mt-1 text-slate-500">Gantt-style room board with drag-to-move scheduling.</p>
      </div>
      <ReservationBoard hotel={hotel} hotels={hotels} rooms={rooms} reservations={reservations} from={from} to={to} />
    </div>
  );
}
