import { redirect } from 'next/navigation';
import { canAccessHotel, canManagePricingSetup, requireStaff } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { PaymentChannelsManager, type PaymentChannel } from '@/components/PaymentChannelsManager';
import type { Hotel } from '@/types/app';

export default async function PaymentChannelsPage() {
  const staff = await requireStaff();
  if (!canManagePricingSetup(staff.profile)) redirect('/dashboard');
  const [{ data: hotelsRaw }, { data: channelsRaw }] = await Promise.all([
    supabaseAdmin.from('hotels').select('*').eq('active', true).order('name'),
    supabaseAdmin.from('payment_channels').select('*').order('sort_order')
  ]);
  const hotels = ((hotelsRaw || []) as Hotel[]).filter((hotel) => canAccessHotel(staff.profile, hotel.id));
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-black tracking-tight">Payment channels</h1>
        <p className="mt-1 text-slate-500">Cash, GCash, Maya, bank, card, cheque, OTA payout, and company billing. The card surcharge and bank MDR are settings.</p>
      </div>
      <PaymentChannelsManager hotels={hotels} channels={(channelsRaw || []) as PaymentChannel[]} />
    </div>
  );
}
