import { supabaseAdmin } from '@/lib/supabase-admin';
import { canCreateReservation } from '@/lib/access';
import { requireStaff, canAccessHotel } from '@/lib/auth';
import { businessToday, monthRange } from '@/lib/date';
import { ReservationBoard } from '@/components/ReservationBoard';
import type { Hotel, Reservation, Room } from '@/types/app';
import { EmptyHotelStateLocalized } from '@/components/EmptyHotelStateLocalized';

type SearchParams = { hotel?: string; from?: string; to?: string };

export default async function ReservationsPage({ searchParams }: { searchParams?: Promise<SearchParams> }) {
  const params = (await searchParams) || {};
  const staff = await requireStaff();

  const { data: hotelsRaw } = await supabaseAdmin.from('hotels').select('*').eq('active', true).order('name');
  const hotels = ((hotelsRaw || []) as Hotel[]).filter((hotel) => canAccessHotel(staff.profile, hotel.id));
  const hotel = hotels.find((item) => item.id === params.hotel) || hotels[0];
  const { from: defaultFrom, to: defaultTo } = monthRange(new Date(), hotel?.timezone);
  const from = params.from || defaultFrom;
  const to = params.to || defaultTo;

  if (!hotel) {
    return <EmptyHotelStateLocalized />;
  }

  const boardSelect = '*, guests(*), rooms(id,name,room_type_name)';
  const [{ data: roomsRaw }, { data: reservationsRaw }, { data: overdueRaw }] = await Promise.all([
    supabaseAdmin.from('rooms').select('*').eq('hotel_id', hotel.id).eq('active', true).order('sort_order').order('name'),
    supabaseAdmin
      .from('reservations')
      .select(boardSelect)
      .eq('hotel_id', hotel.id)
      .lt('check_in', to)
      .gt('check_out', from)
      .not('status', 'in', '(cancelled,no_show)')
      .order('check_in'),
    supabaseAdmin
      .from('reservations')
      .select(boardSelect)
      .eq('hotel_id', hotel.id)
      .eq('status', 'checked_in')
      .lte('check_out', from)
      .lt('check_in', to)
      .order('check_in')
  ]);

  const rooms = (roomsRaw || []) as Room[];
  const byId = new Map<string, Reservation>();
  for (const reservation of [...((reservationsRaw || []) as Reservation[]), ...((overdueRaw || []) as Reservation[])]) {
    byId.set(reservation.id, reservation);
  }
  const reservations = [...byId.values()];
  const today = businessToday(hotel.timezone);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-black tracking-tight">Reservations</h1>
        <p className="mt-1 text-slate-500">Gantt-style room board with drag-to-move scheduling.</p>
      </div>
      <ReservationBoard hotel={hotel} hotels={hotels} rooms={rooms} reservations={reservations} from={from} to={to} today={today} canCreate={canCreateReservation(staff.profile.role)} />
    </div>
  );
}
