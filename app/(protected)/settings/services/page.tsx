import { Suspense } from 'react';
import { canAccessHotel, canManageServiceCatalog, requireStaff } from '@/lib/auth';
import { redirect } from 'next/navigation';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { ServiceCatalogManager } from '@/components/ServiceCatalogManager';
import type { Hotel, ServiceItem } from '@/types/app';

export default async function SettingsServicesPage() {
  const staff = await requireStaff();
  if (!canManageServiceCatalog(staff.profile)) redirect('/dashboard');

  const [{ data: hotelsRaw }, { data: serviceItemsRaw }] = await Promise.all([
    supabaseAdmin.from('hotels').select('*').eq('active', true).order('name'),
    supabaseAdmin.from('service_items').select('*').order('name')
  ]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-black tracking-tight">Services & Charges</h1>
        <p className="mt-1 text-slate-500">Breakfast, extra bed, and hourly charges. Managers and owners can change the prices.</p>
      </div>
      <Suspense fallback={<div className="card p-6">Loading service catalog...</div>}>
        <ServiceCatalogManager
          hotels={((hotelsRaw || []) as Hotel[]).filter((hotel) => canAccessHotel(staff.profile, hotel.id))}
          serviceItems={(serviceItemsRaw || []) as ServiceItem[]}
        />
      </Suspense>
    </div>
  );
}
