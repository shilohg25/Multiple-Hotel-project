import { redirect } from 'next/navigation';
import { canAccessHotel, canManagePricingSetup, requireStaff } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { ChannelRatesManager } from '@/components/ChannelRatesManager';
import type { ChannelRate, Hotel, Room, RoomType } from '@/types/app';

export default async function ChannelRatesPage() {
  const staff = await requireStaff();
  if (!canManagePricingSetup(staff.profile)) redirect('/dashboard');

  const [{ data: hotelsRaw }, { data: typesRaw }, { data: ratesRaw }, { data: roomsRaw }] = await Promise.all([
    supabaseAdmin.from('hotels').select('*').eq('active', true).order('name'),
    supabaseAdmin.from('room_types').select('*').eq('active', true).order('name'),
    supabaseAdmin.from('room_type_channel_rates').select('*'),
    supabaseAdmin.from('rooms').select('*').eq('active', true).order('sort_order')
  ]);

  const hotels = ((hotelsRaw || []) as Hotel[]).filter((hotel) => canAccessHotel(staff.profile, hotel.id));
  const hotelIds = new Set(hotels.map((hotel) => hotel.id));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-black tracking-tight">Room rates by channel</h1>
        <p className="mt-1 text-slate-500">Set the walk-in, OTA, and short-time price for each room type. A one-off price still needs a manager to approve it on the stay.</p>
      </div>
      <ChannelRatesManager
        hotels={hotels}
        roomTypes={((typesRaw || []) as RoomType[]).filter((item) => hotelIds.has(item.hotel_id))}
        rates={(ratesRaw || []) as ChannelRate[]}
        rooms={((roomsRaw || []) as Room[]).filter((item) => hotelIds.has(item.hotel_id))}
      />
    </div>
  );
}
