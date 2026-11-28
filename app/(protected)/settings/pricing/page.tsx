import { Suspense } from 'react';
import { requireOwner } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { SettingsPricingManager } from '@/components/SettingsPricingManager';
import type { Hotel, Room } from '@/types/app';
import { getLocale, label } from '@/lib/i18n';
import { emptyHotelMessageKey } from '@/lib/empty-hotel';

export default async function SettingsPricingPage() {
  await requireOwner();
  const locale = await getLocale();
  const emptyHotelMessage = label(locale, emptyHotelMessageKey('owner'));

  const [{ data: hotelsRaw }, { data: roomsRaw }] = await Promise.all([
    supabaseAdmin.from('hotels').select('*').eq('active', true).order('name'),
    supabaseAdmin.from('rooms').select('*').order('sort_order').order('name')
  ]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-black tracking-tight">Room Pricing</h1>
        <p className="mt-1 text-sm text-slate-600">Owner-only controls for room rate snapshots used by new reservations.</p>
      </div>
      <Suspense fallback={<div className="card p-6">Loading pricing settings...</div>}>
        <SettingsPricingManager hotels={(hotelsRaw || []) as Hotel[]} rooms={(roomsRaw || []) as Room[]} emptyHotelMessage={emptyHotelMessage} />
      </Suspense>
    </div>
  );
}
