import { Suspense } from 'react';
import { requireStaff, canAccessHotel } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { RoomManager } from '@/components/RoomManager';
import type { Hotel, Room } from '@/types/app';

export default async function RoomsPage() {
  const staff = await requireStaff();
  const [{ data: hotelsRaw }, { data: roomsRaw }] = await Promise.all([
    supabaseAdmin.from('hotels').select('*').eq('active', true).order('name'),
    supabaseAdmin.from('rooms').select('*').order('sort_order').order('name')
  ]);
  const hotels = ((hotelsRaw || []) as Hotel[]).filter((hotel) => canAccessHotel(staff.profile, hotel.id));
  const hotelIds = new Set(hotels.map((hotel) => hotel.id));
  const rooms = ((roomsRaw || []) as Room[]).filter((room) => hotelIds.has(room.hotel_id));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-black tracking-tight">Rooms</h1>
        <p className="mt-1 text-slate-500">Manage room inventory for each hotel.</p>
      </div>
      <Suspense fallback={<div className="card p-6">Loading rooms...</div>}>
        <RoomManager hotels={hotels} rooms={rooms} />
      </Suspense>
    </div>
  );
}
