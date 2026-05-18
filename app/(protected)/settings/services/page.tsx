import { Suspense } from 'react';
import { requireOwner } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { ServiceCatalogManager } from '@/components/ServiceCatalogManager';
import type { Hotel, ServiceItem } from '@/types/app';

export default async function SettingsServicesPage() {
  await requireOwner();

  const [{ data: hotelsRaw }, { data: serviceItemsRaw }] = await Promise.all([
    supabaseAdmin.from('hotels').select('*').eq('active', true).order('name'),
    supabaseAdmin.from('service_items').select('*').order('name')
  ]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-black tracking-tight">Services & Charges</h1>
        <p className="mt-1 text-slate-500">Owner-only service catalog defaults for reservation folios.</p>
      </div>
      <Suspense fallback={<div className="card p-6">Loading service catalog...</div>}>
        <ServiceCatalogManager hotels={(hotelsRaw || []) as Hotel[]} serviceItems={(serviceItemsRaw || []) as ServiceItem[]} />
      </Suspense>
    </div>
  );
}
