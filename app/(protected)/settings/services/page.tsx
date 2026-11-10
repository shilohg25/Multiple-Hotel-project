import { Suspense } from 'react';
import { canManageServiceCatalog, requireStaff } from '@/lib/auth';
import { redirect } from 'next/navigation';
import { hotelsForProfile, rowsForHotels } from '@/lib/hotel-scope';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { ServiceCatalogManager } from '@/components/ServiceCatalogManager';
import type { Hotel, ServiceItem } from '@/types/app';

export default async function SettingsServicesPage() {
  const staff = await requireStaff();
  if (!canManageServiceCatalog(staff.profile)) redirect('/dashboard');

  const { data: hotelsRaw } = await supabaseAdmin.from('hotels').select('*').eq('active', true).order('name');
  const hotels = hotelsForProfile(staff.profile, (hotelsRaw || []) as Hotel[]);
  const hotelIds = hotels.map((hotel) => hotel.id);
  const { data: serviceItemsRaw } = hotelIds.length
    ? await supabaseAdmin.from('service_items').select('*').in('hotel_id', hotelIds).order('name')
    : { data: [] };
  const serviceItems = rowsForHotels((serviceItemsRaw || []) as ServiceItem[], new Set(hotelIds));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-black tracking-tight">Services & Charges</h1>
        <p className="mt-1 text-slate-500">Breakfast, extra bed, and hourly charges. Managers and owners can change the prices.</p>
      </div>
      <Suspense fallback={<div className="card p-6">Loading service catalog...</div>}>
        <ServiceCatalogManager hotels={hotels} serviceItems={serviceItems} />
      </Suspense>
    </div>
  );
}
