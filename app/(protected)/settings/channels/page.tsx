import { redirect } from 'next/navigation';
import { canManagePricingSetup, requireStaff } from '@/lib/auth';
import { hotelsForProfile, rowsForHotels } from '@/lib/hotel-scope';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { PaymentChannelsManager, type PaymentChannel } from '@/components/PaymentChannelsManager';
import type { Hotel } from '@/types/app';

export default async function PaymentChannelsPage() {
  const staff = await requireStaff();
  if (!canManagePricingSetup(staff.profile)) redirect('/dashboard');
  const { data: hotelsRaw } = await supabaseAdmin.from('hotels').select('*').eq('active', true).order('name');
  const hotels = hotelsForProfile(staff.profile, (hotelsRaw || []) as Hotel[]);
  const hotelIds = hotels.map((hotel) => hotel.id);
  const { data: channelsRaw } = hotelIds.length
    ? await supabaseAdmin.from('payment_channels').select('*').in('hotel_id', hotelIds).order('sort_order')
    : { data: [] };
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-black tracking-tight">Payment channels</h1>
        <p className="mt-1 text-slate-500">Cash, GCash, Maya, bank, card, cheque, OTA payout, and company billing. The card surcharge and bank MDR are settings.</p>
      </div>
      <PaymentChannelsManager hotels={hotels} channels={rowsForHotels((channelsRaw || []) as PaymentChannel[], new Set(hotelIds))} />
    </div>
  );
}
