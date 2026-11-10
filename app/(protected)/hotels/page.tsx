import { supabaseAdmin } from '@/lib/supabase-admin';
import { requireStaff } from '@/lib/auth';
import { hotelsForProfile, rowsForHotels } from '@/lib/hotel-scope';
import { HotelManager, type HotelRoomCount } from '@/components/HotelManager';
import { ReportingUnitsManager } from '@/components/ReportingUnitsManager';
import { PropertyHoursForm } from '@/components/PropertyHoursForm';
import type { Hotel, Outlet, Room } from '@/types/app';

export default async function HotelsPage() {
  const staff = await requireStaff();
  const { data } = await supabaseAdmin.from('hotels').select('*').order('name');
  const hotels = hotelsForProfile(staff.profile, (data || []) as Hotel[]);
  const hotelIdList = hotels.map((hotel) => hotel.id);
  const hotelIds = new Set(hotelIdList);
  const [{ data: roomsRaw }, { data: outletsRaw }] = hotelIdList.length
    ? await Promise.all([
        supabaseAdmin.from('rooms').select('id, hotel_id, active').in('hotel_id', hotelIdList),
        supabaseAdmin.from('outlets').select('*').in('hotel_id', hotelIdList).order('name')
      ])
    : [{ data: [] }, { data: [] }];
  const roomCounts = ((roomsRaw || []) as Pick<Room, 'id' | 'hotel_id' | 'active'>[])
    .filter((room) => hotelIds.has(room.hotel_id))
    .reduce<HotelRoomCount[]>((counts, room) => {
      let count = counts.find((item) => item.hotel_id === room.hotel_id);
      if (!count) {
        count = { hotel_id: room.hotel_id, total: 0, active: 0, inactive: 0 };
        counts.push(count);
      }
      count.total += 1;
      if (room.active) count.active += 1;
      else count.inactive += 1;
      return counts;
    }, []);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-black tracking-tight">Hotels / Properties</h1>
        <p className="mt-1 text-slate-500">Add and manage hotels, rental properties, and the rooms/units they can book.</p>
      </div>
      <HotelManager hotels={hotels} roomCounts={roomCounts} role={staff.profile.role} />
      <PropertyHoursForm hotels={hotels} role={staff.profile.role} />
      <ReportingUnitsManager hotels={hotels} outlets={rowsForHotels((outletsRaw || []) as Outlet[], hotelIds)} role={staff.profile.role} />
    </div>
  );
}
