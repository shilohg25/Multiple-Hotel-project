import { supabaseAdmin } from '@/lib/supabase-admin';
import { requireStaff, canAccessHotel } from '@/lib/auth';
import { HotelManager } from '@/components/HotelManager';
import type { Hotel } from '@/types/app';

export default async function HotelsPage() {
  const staff = await requireStaff();
  const { data } = await supabaseAdmin.from('hotels').select('*').order('name');
  const hotels = ((data || []) as Hotel[]).filter((hotel) => canAccessHotel(staff.profile, hotel.id));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-black tracking-tight">Hotels</h1>
        <p className="mt-1 text-slate-500">Add and manage hotel properties. The app is built to support more than two hotels.</p>
      </div>
      <HotelManager hotels={hotels} role={staff.profile.role} />
    </div>
  );
}
