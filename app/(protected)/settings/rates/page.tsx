import { redirect } from 'next/navigation';
import { canManagePricingSetup, requireStaff } from '@/lib/auth';
import { hotelsForProfile, rowsForHotels, rowsLinkedTo } from '@/lib/hotel-scope';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { ChannelRatesManager } from '@/components/ChannelRatesManager';
import type { ChannelRate, Hotel, Room, RoomType } from '@/types/app';

export default async function ChannelRatesPage() {
  const staff = await requireStaff();
  if (!canManagePricingSetup(staff.profile)) redirect('/dashboard');

  const { data: hotelsRaw } = await supabaseAdmin.from('hotels').select('*').eq('active', true).order('name');
  const hotels = hotelsForProfile(staff.profile, (hotelsRaw || []) as Hotel[]);
  const hotelIds = [...new Set(hotels.map((hotel) => hotel.id))];
  const [{ data: typesRaw }, { data: roomsRaw }] = hotelIds.length
    ? await Promise.all([
        supabaseAdmin.from('room_types').select('*').in('hotel_id', hotelIds).eq('active', true).order('name'),
        supabaseAdmin.from('rooms').select('*').in('hotel_id', hotelIds).eq('active', true).order('sort_order')
      ])
    : [{ data: [] }, { data: [] }];
  const allowedHotelIds = new Set(hotelIds);
  const roomTypes = rowsForHotels((typesRaw || []) as RoomType[], allowedHotelIds);
  const roomTypeIds = [...new Set(roomTypes.map((roomType) => roomType.id))];
  const { data: ratesRaw } = roomTypeIds.length
    ? await supabaseAdmin.from('room_type_channel_rates').select('*').in('room_type_id', roomTypeIds)
    : { data: [] };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-black tracking-tight">Room rates by channel</h1>
        <p className="mt-1 text-slate-500">Set the walk-in, OTA, and short-time price for each room type. A one-off price still needs a manager to approve it on the stay.</p>
      </div>
      <ChannelRatesManager
        hotels={hotels}
        roomTypes={roomTypes}
        rates={rowsLinkedTo((ratesRaw || []) as ChannelRate[], (rate) => rate.room_type_id, new Set(roomTypeIds))}
        rooms={rowsForHotels((roomsRaw || []) as Room[], allowedHotelIds)}
      />
    </div>
  );
}
